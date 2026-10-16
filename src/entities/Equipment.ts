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
import { Site } from "./Site";

export type EquipmentStatus =
  | "operational"
  | "warning"
  | "faulty"
  | "under_maintenance"
  | "retired";

@Entity({ name: "equipment", schema: "public" })
@Index("equipment_site_id_idx", ["siteId"])
@Index("equipment_status_idx", ["status"])
@Index("equipment_next_maintenance_idx", ["nextMaintenanceAt"])
export class Equipment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "site_id", type: "uuid" })
  siteId!: string;

  @ManyToOne(() => Site, (site) => site.equipment, { onDelete: "CASCADE" })
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

  @Column({ type: "integer", default: 1 })
  quantity!: number;

  @Column({ type: "varchar", length: 40, default: "unit" })
  unit!: string;

  @Column({ type: "varchar", length: 30, default: "operational" })
  status!: EquipmentStatus;

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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
