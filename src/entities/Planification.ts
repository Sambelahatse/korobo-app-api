import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import type { Relation } from "typeorm";
import { AppUser } from "./AppUser";
import { Site } from "./Site";

export type PlanificationStatus = "planned" | "in_progress" | "completed" | "cancelled";

@Entity({ name: "planifications", schema: "public" })
@Index("planifications_site_id_idx", ["siteId"])
@Index("planifications_scheduled_at_idx", ["scheduledAt"])
@Index("planifications_status_idx", ["status"])
export class Planification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "organization_id", type: "uuid" })
  organizationId!: string;

  @Column({ name: "site_id", type: "uuid" })
  siteId!: string;

  @ManyToOne(() => Site, (site) => site.planifications, { onDelete: "CASCADE" })
  @JoinColumn({ name: "site_id" })
  site!: Relation<Site>;

  @Column({ type: "varchar", length: 180 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "maintenance_type", type: "varchar", length: 80, nullable: true })
  maintenanceType!: string | null;

  @Column({ name: "scheduled_at", type: "timestamptz" })
  scheduledAt!: Date;

  @Column({ name: "duration_minutes", type: "integer", nullable: true })
  durationMinutes!: number | null;

  @Column({ type: "varchar", length: 30, default: "planned" })
  status!: PlanificationStatus;

  @Column({ name: "assigned_to", type: "uuid", nullable: true })
  assignedToId!: string | null;

  @ManyToOne(() => AppUser, (user) => user.assignedPlanifications, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "assigned_to" })
  assignedTo!: Relation<AppUser> | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdById!: string | null;

  @ManyToOne(() => AppUser, (user) => user.createdPlanifications, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  createdBy!: Relation<AppUser> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
