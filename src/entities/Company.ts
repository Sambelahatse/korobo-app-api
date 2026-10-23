import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "companies", schema: "public" })
@Index("companies_slug_idx", ["slug"], { unique: true })
export class Company {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 180 })
  name!: string;

  @Column({ type: "varchar", length: 200, unique: true })
  slug!: string;

  @Column({ type: "varchar", length: 2000, nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  sector!: string | null;

  @Column({ name: "legal_form", type: "varchar", length: 120, nullable: true })
  legalForm!: string | null;

  @Column({ name: "tax_id", type: "varchar", length: 120, nullable: true })
  taxId!: string | null;

  @Column({ name: "statistical_id", type: "varchar", length: 120, nullable: true })
  statisticalId!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  address!: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  city!: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  region!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  country!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 254, nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  website!: string | null;

  @Column({ name: "logo_url", type: "varchar", length: 1000, nullable: true })
  logoUrl!: string | null;

  @Column({ name: "owner_user_id", type: "uuid", nullable: true })
  ownerUserId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}