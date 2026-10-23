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
import { Planification } from "./Planification";
import { Site } from "./Site";

export type RapportStatus = "draft" | "validated";
export type RapportType = "mensuel" | "incident" | "intervention";

@Entity({ name: "rapports", schema: "public" })
@Index("rapports_site_id_idx", ["siteId"])
@Index("rapports_report_date_idx", ["reportDate"])
@Index("rapports_status_idx", ["status"])
export class Rapport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "site_id", type: "uuid" })
  siteId!: string;

  @ManyToOne(() => Site, (site) => site.rapports, { onDelete: "CASCADE" })
  @JoinColumn({ name: "site_id" })
  site!: Relation<Site>;

  @Column({ name: "planification_id", type: "uuid", nullable: true })
  planificationId!: string | null;

  @ManyToOne(() => Planification, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "planification_id" })
  planification!: Relation<Planification> | null;

  @Column({ type: "varchar", length: 180 })
  title!: string;

  @Column({ name: "report_type", type: "varchar", length: 30, default: "intervention" })
  reportType!: RapportType;

  @Column({ name: "technician_id", type: "uuid", nullable: true })
  technicianId!: string | null;

  @ManyToOne(() => AppUser, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "technician_id" })
  technician!: Relation<AppUser> | null;

  @Column({ name: "report_date", type: "date", default: () => "CURRENT_DATE" })
  reportDate!: string;

  @Column({ type: "varchar", length: 30, default: "draft" })
  status!: RapportStatus;

  @Column({ type: "text", nullable: true })
  summary!: string | null;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  findings!: unknown[];

  @Column({ name: "actions_taken", type: "text", nullable: true })
  actionsTaken!: string | null;

  @Column({ type: "text", nullable: true })
  recommendations!: string | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdById!: string | null;

  @ManyToOne(() => AppUser, (user) => user.createdRapports, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  createdBy!: Relation<AppUser> | null;

  @Column({ name: "validated_by", type: "uuid", nullable: true })
  validatedById!: string | null;

  @ManyToOne(() => AppUser, (user) => user.validatedRapports, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "validated_by" })
  validatedBy!: Relation<AppUser> | null;

  @Column({ name: "validated_at", type: "timestamptz", nullable: true })
  validatedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
