import { lambda } from "@pulumi/aws";

export const LAMBDA_RUNTIME = lambda.Runtime.NodeJS16dX;
