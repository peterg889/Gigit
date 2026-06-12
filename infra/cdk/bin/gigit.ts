import * as cdk from "aws-cdk-lib";
import { GigitStack } from "../lib/gigit-stack.js";

const app = new cdk.App();
new GigitStack(app, "GigitStaging", {
  env: { region: process.env.CDK_REGION ?? "us-east-1" },
  stage: "staging",
});
// Production lives in a separate AWS account (engineering-spec K11):
// CDK_ACCOUNT/CDK_REGION select it via the deploy role.
new GigitStack(app, "GigitProd", {
  env: { region: process.env.CDK_REGION ?? "us-east-1" },
  stage: "prod",
});
