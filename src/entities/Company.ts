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

  @Column({ name: "owner_user_id", type: "uuid", nullable: true })
  ownerUserId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}