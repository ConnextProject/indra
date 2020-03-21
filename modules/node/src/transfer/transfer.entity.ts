import { ViewColumn, ViewEntity } from "typeorm";
// TODO: why is this not working :( in expression
import { TransferType } from "@connext/types";

@ViewEntity({
  expression: `
  SELECT
    "fast_signed_transfer"."paymentId" as "paymentId",
    "fast_signed_transfer"."amount" as "amount",
    "fast_signed_transfer"."assetId" as "assetId",
    "sender_channel"."userPublicIdentifier" as "senderPublicIdentifier",
    "fast_signed_transfer"."createdAt" as "createdAt",
    "fast_signed_transfer"."meta" as "meta",
    "receiver_channel"."userPublicIdentifier" as "receiverPublicIdentifier",
    "fast_signed_transfer"."status"::TEXT as "status",
    'FAST_SIGNED' AS "type"
  FROM fast_signed_transfer
    LEFT JOIN channel receiver_channel ON receiver_channel.id = fast_signed_transfer."receiverChannelId"
    LEFT JOIN channel sender_channel ON sender_channel.id = fast_signed_transfer."senderChannelId"
  UNION ALL
  SELECT
    "linked_transfer"."paymentId" as "paymentId",
    "linked_transfer"."amount" as "amount",
    "linked_transfer"."assetId" as "assetId",
    "sender_channel"."userPublicIdentifier" as "senderPublicIdentifier",
    "linked_transfer"."createdAt" as "createdAt",
    "linked_transfer"."meta" as "meta",
    "linked_transfer"."recipientPublicIdentifier" as "receiverPublicIdentifier",
    "linked_transfer"."status"::TEXT as "status",
    'LINKED' AS "type"
  FROM linked_transfer
    LEFT JOIN channel receiver_channel ON receiver_channel.id = linked_transfer."receiverChannelId"
    LEFT JOIN channel sender_channel ON sender_channel.id = linked_transfer."senderChannelId";
  `,
})
export class Transfer {
  @ViewColumn()
  paymentId!: string;

  @ViewColumn()
  createdAt!: Date;

  @ViewColumn()
  amount!: string;

  @ViewColumn()
  assetId!: string;

  @ViewColumn()
  senderPublicIdentifier!: string;

  @ViewColumn()
  receiverPublicIdentifier!: string;

  @ViewColumn()
  type!: TransferType;

  @ViewColumn()
  status!: string;

  @ViewColumn()
  meta!: object;
}
