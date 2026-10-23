import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  UpdateDateColumn
} from "typeorm";
import type { Relation } from "typeorm";
import { Planification } from "./Planification";
import { Rapport } from "./Rapport";
import { Company } from "./Company";

export type AppUserRole = "admin" | "manager" | "technician" | "viewer";

@Entity({ name: "app_users", schema: "public" })
export class AppUser {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ name: "company_id", type: "uuid" })
  companyId!: string;

  @ManyToOne(() => Company, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "company_id" })
  company!: Relation<Company>;

  @Column({ name: "full_name", type: "varchar", length: 160 })
  fullName!: string;

  @Column({ type: "varchar", length: 254, unique: true })
  email!: string;

  @Column({ name: "password_hash", type: "varchar", length: 255, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ name: "google_sub", type: "varchar", length: 255, nullable: true, unique: true })
  googleSub!: string | null;

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
