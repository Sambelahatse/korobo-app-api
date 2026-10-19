import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn
} from "typeorm";
import type { Relation } from "typeorm";
import { Planification } from "./Planification";
import { Rapport } from "./Rapport";

export type AppUserRole = "admin" | "manager" | "technician" | "viewer";

@Entity({ name: "app_users", schema: "public" })
export class AppUser {
  // Preserve the UUID so existing foreign-key relationships remain valid.
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ name: "full_name", type: "varchar", length: 160 })
  fullName!: string;

  @Column({ type: "varchar", length: 254, unique: true })
  email!: string;

  @Column({ name: "password_hash", type: "varchar", length: 100, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ name: "password_setup_token_hash", type: "varchar", length: 64, nullable: true, select: false })
  passwordSetupTokenHash!: string | null;

  @Column({ name: "password_setup_expires_at", type: "timestamptz", nullable: true, select: false })
  passwordSetupExpiresAt!: Date | null;

  @Column({ type: "varchar", length: 40, default: "technician" })
  role!: AppUserRole;

  @Column({ type: "varchar", length: 40, nullable: true })
  phone!: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => Planification, (planification) => planification.assignedTo)
  assignedPlanifications!: Relation<Planification[]>;

  @OneToMany(() => Planification, (planification) => planification.createdBy)
  createdPlanifications!: Relation<Planification[]>;

  @OneToMany(() => Rapport, (rapport) => rapport.createdBy)
  createdRapports!: Relation<Rapport[]>;

  @OneToMany(() => Rapport, (rapport) => rapport.validatedBy)
  validatedRapports!: Relation<Rapport[]>;
}
