import { ViewColumn, ViewEntity } from "typeorm";
// TODO: why is this not working :( in expression
import { TransferType } from "@connext/types";

@ViewEntity({
  expression: `
  SELECT
    "peer_to_peer_transfer"."id"::TEXT as "paymentId",
    "peer_to_peer_transfer"."amount" as "amount",
    "peer_to_peer_transfer"."assetId" as "assetId",
    encode(digest("sender_channel"."userPublicIdentifier", 'sha256'), 'hex') as "senderChannelIdentifier",
    encode(digest("receiver_channel"."userPublicIdentifier", 'sha256'), 'hex') as "receiverChannelIdentifier",
    "peer_to_peer_transfer"."createdAt" as "createdAt",
    "peer_to_peer_transfer"."meta" as "meta",
    "peer_to_peer_transfer"."status"::TEXT as "status",
    'P2P' AS "type"
  FROM peer_to_peer_transfer
    LEFT JOIN "channel" "receiver_channel" ON "receiver_channel"."id" = "peer_to_peer_transfer"."receiverChannelId"
    LEFT JOIN "channel" "sender_channel" ON "sender_channel"."id" = "peer_to_peer_transfer"."senderChannelId"
  UNION ALL
  SELECT
    "linked_transfer"."paymentId" as "paymentId",
    "linked_transfer"."amount" as "amount",
    "linked_transfer"."assetId" as "assetId",
    encode(digest("sender_channel"."userPublicIdentifier", 'sha256'), 'hex') as "senderChannelIdentifier",
    encode(digest("receiver_channel"."userPublicIdentifier", 'sha256'), 'hex') as "receiverChannelIdentifier",
    "linked_transfer"."createdAt" as "createdAt",
    "linked_transfer"."meta" as "meta",
    "linked_transfer"."status"::TEXT as "status",
    'LINKED' AS "type"
  FROM linked_transfer
    LEFT JOIN "channel" "receiver_channel" ON "receiver_channel"."id" = "linked_transfer"."receiverChannelId"
    LEFT JOIN "channel" "sender_channel" ON "sender_channel"."id" = "linked_transfer"."senderChannelId";
  `,
})
export class AnonymizedTransfer {
  @ViewColumn()
  paymentId!: string;

  @ViewColumn()
  createdAt!: Date;

  @ViewColumn()
  amount!: string;

  @ViewColumn()
  assetId!: string;

  @ViewColumn()
  senderChannelIdentifier!: string;

  @ViewColumn()
  receiverChannelIdentifier!: string;

  @ViewColumn()
  type!: TransferType;

  @ViewColumn()
  status!: string;

  @ViewColumn()
  meta!: object;
}
