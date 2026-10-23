import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type NotificationType = "alerte" | "avertissement" | "info" | "succès";

@Entity({ name: "notifications", schema: "public" })
@Index("notifications_recipient_created_idx", ["companyId", "recipientId", "createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "company_id", type: "uuid" })
  companyId!: string;

  @Column({ name: "recipient_id", type: "uuid" })
  recipientId!: string;

  @Column({ type: "varchar", length: 30, default: "info" })
  type!: NotificationType;

  @Column({ type: "varchar", length: 180 })
  title!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ name: "site_name", type: "varchar", length: 180, nullable: true })
  siteName!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  link!: string | null;

  @Column({ name: "is_read", type: "boolean", default: false })
  isRead!: boolean;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
