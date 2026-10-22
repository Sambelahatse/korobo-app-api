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

export type EquipmentStatus =
  | "operational"
  | "warning"
  | "faulty"
  | "under_maintenance"
  | "retired";
export type EquipmentTrackingMode = "individual" | "quantity";

@Entity({ name: "equipment", schema: "public" })
@Index("equipment_site_id_idx", ["siteId"])
@Index("equipment_status_idx", ["status"])
@Index("equipment_next_maintenance_idx", ["nextMaintenanceAt"])
@Index("equipment_tracking_mode_idx", ["trackingMode"])
@Index("equipment_assigned_to_idx", ["assignedToId"])
export class Equipment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "company_id", type: "uuid" })
  companyId!: string;

  @Column({ name: "site_id", type: "uuid" })
  siteId!: string;

  @ManyToOne(() => Site, (site) => site.equipment, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "site_id" })
  site!: Relation<Site>;

  @Column({ type: "varchar", length: 180 })
  name!: string;

  @Column({ type: "varchar", length: 80 })
  category!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  brand!: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  model!: string | null;

  @Column({ name: "serial_number", type: "varchar", length: 160, nullable: true })
  serialNumber!: string | null;

  @Column({ name: "tracking_mode", type: "varchar", length: 20, default: "individual" })
  trackingMode!: EquipmentTrackingMode;

  @Column({ type: "integer", default: 1 })
  quantity!: number;

  @Column({ name: "available_quantity", type: "integer", default: 0 })
  availableQuantity!: number;

  @Column({ name: "assigned_quantity", type: "integer", default: 0 })
  assignedQuantity!: number;

  @Column({ type: "varchar", length: 40, default: "unit" })
  unit!: string;

  @Column({ type: "varchar", length: 30, default: "operational" })
  status!: EquipmentStatus;

  @Column({ name: "assigned_to", type: "uuid", nullable: true })
  assignedToId!: string | null;

  @ManyToOne(() => AppUser, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "assigned_to" })
  assignedTo!: Relation<AppUser> | null;

  @Column({ name: "installed_at", type: "date", nullable: true })
  installedAt!: string | null;

  @Column({ name: "last_maintenance_at", type: "date", nullable: true })
  lastMaintenanceAt!: string | null;

  @Column({ name: "next_maintenance_at", type: "date", nullable: true })
  nextMaintenanceAt!: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  specifications!: Record<string, unknown>;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ name: "archived_at", type: "timestamptz", nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
