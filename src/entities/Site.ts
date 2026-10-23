import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import type { Relation } from "typeorm";
import { Equipment } from "./Equipment";
import { Planification } from "./Planification";
import { Rapport } from "./Rapport";
import { Organization } from "./Organization";

export type SiteStatus = "active" | "inactive" | "maintenance" | "terminated";

@Entity({ name: "sites", schema: "public" })
@Index("sites_status_idx", ["status"])
@Index("sites_name_idx", ["name"])
export class Site {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "organization_id", type: "uuid" })
  organizationId!: string;

  @ManyToOne(() => Organization, (organization) => organization.sites, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "organization_id" })
  organization!: Relation<Organization>;

  @Column({ name: "case_number", type: "varchar", length: 80, nullable: true })
  caseNumber!: string | null;

  @Column({ type: "varchar", length: 180 })
  name!: string;

  @Column({ type: "text" })
  location!: string;

  @Column({ name: "owner_name", type: "varchar", length: 180 })
  ownerName!: string;

  @Column({ name: "owner_phone", type: "varchar", length: 40, nullable: true })
  ownerPhone!: string | null;

  @Column({ name: "owner_email", type: "varchar", length: 254, nullable: true })
  ownerEmail!: string | null;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({ name: "installation_year", type: "smallint", nullable: true })
  installationYear!: number | null;

  @Column({ name: "installation_type", type: "varchar", length: 100, nullable: true })
  installationType!: string | null;

  @Column({ name: "power_kw", type: "numeric", precision: 12, scale: 3, nullable: true })
  powerKw!: string | null;

  @Column({ name: "installer_name", type: "varchar", length: 180, nullable: true })
  installerName!: string | null;

  @Column({ name: "installer_phone", type: "varchar", length: 40, nullable: true })
  installerPhone!: string | null;

  @Column({ name: "electrical_installation", type: "text", nullable: true })
  electricalInstallation!: string | null;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  batteries!: unknown[];

  @Column({ name: "pv_types", type: "jsonb", default: () => "'[]'::jsonb" })
  pvTypes!: unknown[];

  @Column({ name: "mttp_types", type: "jsonb", default: () => "'[]'::jsonb" })
  mttpTypes!: unknown[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  controllers!: unknown[];

  @Column({ name: "generator_info", type: "jsonb", default: () => "'{}'::jsonb" })
  generatorInfo!: Record<string, unknown>;

  @Column({ name: "sav_contract_file_name", type: "text", nullable: true })
  savContractFileName!: string | null;

  @Column({ type: "varchar", length: 30, default: "active" })
  status!: SiteStatus;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => Equipment, (equipment) => equipment.site)
  equipment!: Relation<Equipment[]>;

  @OneToMany(() => Planification, (planification) => planification.site)
  planifications!: Relation<Planification[]>;

  @OneToMany(() => Rapport, (rapport) => rapport.site)
  rapports!: Relation<Rapport[]>;
}
