/**
 * Notification sink (engineering-spec §10): SMS via Twilio REST, email via
 * SES — each enabled by env, falling back to structured logs in dev.
 * Critical-path templates only at M1; copy lives here, versioned in git.
 */
import { db, env, schema } from "@gigit/db";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { eq } from "drizzle-orm";

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  offer_received: {
    subject: "You have a gig offer on Gigit",
    body: "A venue sent you an offer. Review and accept: {url}/bookings",
  },
  booking_confirmed: {
    subject: "Booking confirmed",
    body: "Your booking is confirmed and payment is secured: {url}/bookings",
  },
  offer_expired: {
    subject: "An offer expired",
    body: "An offer expired without acceptance. The slot has reopened: {url}/bookings",
  },
  offer_withdrawn: {
    subject: "An offer was withdrawn",
    body: "The venue withdrew its offer: {url}/bookings",
  },
  payment_failed: {
    subject: "Payment failed",
    body: "Payment for a booking failed; the slot has reopened: {url}/bookings",
  },
  mark_played_prompt: {
    subject: "How did the gig go?",
    body: "Mark your gig as played — payment releases 24h after gig end: {url}/bookings",
  },
  payment_released: {
    subject: "Payment released",
    body: "Payment for your gig has been released: {url}/bookings",
  },
  venue_cancelled: {
    subject: "Booking cancelled by venue",
    body: "The venue cancelled. Any cancellation fee owed to you is being processed: {url}/bookings",
  },
  performer_cancelled: {
    subject: "Performer cancelled",
    body: "The performer cancelled; you have been refunded in full and the slot reopened: {url}/bookings",
  },
  dispute_opened: {
    subject: "A dispute was opened",
    body: "A dispute was opened on your booking; payment is on hold while we review: {url}/bookings",
  },
  dispute_resolved: {
    subject: "Dispute resolved",
    body: "Your dispute has been resolved: {url}/bookings",
  },
  new_application: {
    subject: "New applicant for your slot",
    body: "A performer applied to your slot: {url}",
  },
  new_inquiry: {
    subject: "A venue messaged you",
    body: "You have a new inquiry from a venue: {url}",
  },
  new_message: {
    subject: "New message on Gigit",
    body: "You have a new message: {url}",
  },
};

let ses: SESv2Client | undefined;

export async function notifyBookingParties(
  bookingId: string,
  template: string,
  to: "venue" | "performer" | "both",
): Promise<void> {
  const d = db();
  const [row] = await d
    .select({
      venueOwner: schema.venues.ownerUserId,
      performerOwner: schema.performers.ownerUserId,
    })
    .from(schema.bookings)
    .innerJoin(schema.venues, eq(schema.bookings.venueId, schema.venues.id))
    .innerJoin(
      schema.performers,
      eq(schema.bookings.performerId, schema.performers.id),
    )
    .where(eq(schema.bookings.id, bookingId));
  if (!row) return;
  const userIds =
    to === "both"
      ? [row.venueOwner, row.performerOwner]
      : to === "venue"
        ? [row.venueOwner]
        : [row.performerOwner];
  for (const userId of userIds) await notifyUser(userId, template);
}

export async function notifyUser(userId: string, template: string): Promise<void> {
  const t = TEMPLATES[template] ?? {
    subject: "Gigit update",
    body: `Update (${template}): {url}`,
  };
  const body = t.body.replaceAll("{url}", env().APP_URL);
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user) return;

  if (user.phone && env().TWILIO_ACCOUNT_SID) {
    await sendSms(user.phone, `${t.subject}. ${body}`);
  } else if (user.email && env().EMAIL_FROM) {
    await sendEmail(user.email, t.subject, body);
  } else {
    log("notify.log_sink", { userId, template, subject: t.subject });
  }
}

async function sendSms(to: string, body: string): Promise<void> {
  const sid = env().TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${env().TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: env().TWILIO_FROM ?? "", Body: body }),
    },
  );
  if (!res.ok) log("notify.sms_failed", { to, status: res.status });
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  ses ??= new SESv2Client({ region: env().AWS_REGION });
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: env().EMAIL_FROM!,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: body } } } },
      }),
    );
  } catch (err) {
    log("notify.email_failed", { to, err: String(err) });
  }
}

function log(kind: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), kind, ...data }));
}
