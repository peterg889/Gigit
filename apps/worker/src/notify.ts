/**
 * Notification sink (engineering-spec §10): SMS via Twilio REST, email via
 * SES — each enabled by env, falling back to structured logs in dev.
 * Critical-path templates only at M1; copy lives here, versioned in git.
 */
import { db, env, schema } from "@gigit/db";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { eq } from "drizzle-orm";

// Voice: docs/brand.md §5 — short sentences, one ask per message, plain on
// the bad path. State what happened, what the policy says, what's next.
const TEMPLATES: Record<string, { subject: string; body: string }> = {
  offer_received: {
    subject: "You got an offer",
    body: "A venue made you an offer. The terms and the pay are here: {url}/bookings",
  },
  booking_confirmed: {
    subject: "It's booked",
    body: "Confirmed and in writing. The money is secured and releases after you play: {url}/bookings",
  },
  offer_expired: {
    subject: "An offer expired",
    body: "An offer ran out before it was accepted. The slot is back on the board: {url}/bookings",
  },
  offer_withdrawn: {
    subject: "An offer was withdrawn",
    body: "The venue withdrew its offer. Nothing owed either way: {url}/bookings",
  },
  payment_failed: {
    subject: "Payment didn't go through",
    body: "The charge for a booking failed, so it isn't confirmed. The slot is back on the board: {url}/bookings",
  },
  day_before: {
    subject: "Tomorrow night",
    body: "Gig tomorrow. Set times, contacts, and the terms are all here: {url}/bookings",
  },
  mark_played_prompt: {
    subject: "How'd the night go?",
    body: "Mark the gig played and the pay heads your way. It releases on its own 24 hours after the set ends: {url}/bookings",
  },
  payment_released: {
    subject: "You've been paid",
    body: "The pay for your gig is on its way to your account: {url}/bookings",
  },
  venue_cancelled: {
    subject: "The venue cancelled",
    body: "The venue cancelled the booking. The cancellation policy decides what you're owed, and it's already processing: {url}/bookings",
  },
  performer_cancelled: {
    subject: "The act cancelled",
    body: "The performer cancelled. Your full refund is processing and the slot is back on the board: {url}/bookings",
  },
  dispute_opened: {
    subject: "A dispute was opened",
    body: "We've paused the payout while we look at this. A person reviews it within 5 business days: {url}/bookings",
  },
  dispute_resolved: {
    subject: "Dispute resolved",
    body: "A person reviewed your dispute and made the call. The outcome and the money are here: {url}/bookings",
  },
  new_application: {
    subject: "An act applied to your slot",
    body: "New applicant — profile, media, and reviews are all there: {url}",
  },
  new_inquiry: {
    subject: "A venue messaged you",
    body: "A venue wants to talk. No obligation, reply when you can: {url}",
  },
  new_message: {
    subject: "New message on Gigit",
    body: "You have a new message waiting: {url}",
  },
  slot_match: {
    subject: "A slot just posted that fits",
    body: "A new slot matches your alert — pay's on the listing, one tap to apply: {url}",
  },
  subslot_booked: {
    subject: "Sound is covered",
    body: "The tech is booked. Room specs, input list, and set times are on the booking: {url}/bookings",
  },
  subslot_cancelled: {
    subject: "The sound booking was cancelled",
    body: "The cancellation policy decides what's owed, and it's already processing: {url}/bookings",
  },
  subslot_tech_cancelled: {
    subject: "Your tech cancelled",
    body: "Full refund processing. The sound slot is back open for other techs: {url}/bookings",
  },
  media_rejected: {
    subject: "An upload didn't pass",
    body: "A file you uploaded didn't pass our checks (its contents don't match its type). Try re-exporting and uploading again: {url}/me",
  },
  embed_dead: {
    subject: "A video link went dead",
    body: "One of the videos on your profile no longer plays. Swap it for a live link: {url}/me",
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

/** Sub-slot parties: payer = whichever side funds it; tech if assigned. */
export async function notifySubslotParties(
  subslotId: string,
  template: string,
  to: "payer" | "tech" | "both",
): Promise<void> {
  const d = db();
  const [row] = await d
    .select({
      payer: schema.techSubslots.payer,
      techId: schema.techSubslots.techId,
      venueOwner: schema.venues.ownerUserId,
      performerOwner: schema.performers.ownerUserId,
    })
    .from(schema.techSubslots)
    .innerJoin(schema.bookings, eq(schema.techSubslots.bookingId, schema.bookings.id))
    .innerJoin(schema.venues, eq(schema.bookings.venueId, schema.venues.id))
    .innerJoin(schema.performers, eq(schema.bookings.performerId, schema.performers.id))
    .where(eq(schema.techSubslots.id, subslotId));
  if (!row) return;

  const payerUser = row.payer === "venue" ? row.venueOwner : row.performerOwner;
  const userIds: string[] = [];
  if (to === "payer" || to === "both") userIds.push(payerUser);
  if ((to === "tech" || to === "both") && row.techId) {
    const [tech] = await d
      .select({ owner: schema.techs.ownerUserId })
      .from(schema.techs)
      .where(eq(schema.techs.id, row.techId));
    if (tech) userIds.push(tech.owner);
  }
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

  if (user.phone && env().TWILIO_ACCOUNT_SID && !user.smsOptedOutAt) {
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
