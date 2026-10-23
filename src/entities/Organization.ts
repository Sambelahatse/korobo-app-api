import { CreateDateColumn, Column, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { Relation } from "typeorm";
import { AppUser } from "./AppUser";
import { Site } from "./Site";

@Entity({ name: "organizations", schema: "public" })
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 180 })
  name!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => AppUser, (user) => user.organization)
  users!: Relation<AppUser[]>;

  @OneToMany(() => Site, (site) => site.organization)
  sites!: Relation<Site[]>;
}
