import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { findingsTable } from "./findings";

export type ProjectStatus = "active" | "archived" | "deleted";
export type CandidateStatus = "pending" | "approved" | "rejected" | "merged";

/**
 * Approved projects — created only after a user explicitly approves a
 * candidate (or creates one manually). Sentinel never auto-creates projects.
 */
export const projectsTable = sqliteTable(
  "projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<ProjectStatus>().notNull().default("active"),
    /** 0–1 confidence the grouping is coherent, from the candidate that spawned it (or 1.0 if manually created) */
    confidence: real("confidence").notNull().default(1.0),
    /** Human-readable breakdown of signals that produced this project */
    explanation: text("explanation").notNull().default(""),
    /** Summary auto-generated from top entities/tags/categories (optional) */
    summary: text("summary"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("projects_status_idx").on(table.status),
    index("projects_created_at_idx").on(table.createdAt),
  ]
);

export const insertProjectSchema = createInsertSchema(projectsTable, {
  status: z.enum(["active", "archived", "deleted"]).optional(),
}).omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

/**
 * Many-to-many: which findings belong to a project.
 */
export const projectFilesTable = sqliteTable(
  "project_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    /** "auto" = placed by candidate approval; "user" = manually added by user */
    addedBy: text("added_by").notNull().default("auto"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("project_files_project_id_idx").on(table.projectId),
    index("project_files_finding_id_idx").on(table.findingId),
  ]
);

export type ProjectFile = typeof projectFilesTable.$inferSelect;

/**
 * AI-proposed project candidates. Generating candidates is free — they
 * only become `projects` after explicit user approval.
 */
export const projectCandidatesTable = sqliteTable(
  "project_candidates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    /** Grouped into an approved project when approved */
    projectId: integer("project_id").references(() => projectsTable.id),
    status: text("status").$type<CandidateStatus>().notNull().default("pending"),
    /** 0–1 coherence score — weighted sum of active signals */
    score: real("score").notNull().default(0),
    /** JSON object: { folderProximity, sharedTags, sharedEntities, filenameSimilarity, semanticSimilarity } */
    signals: text("signals", { mode: "json" })
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    explanation: text("explanation").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("project_candidates_status_idx").on(table.status),
    index("project_candidates_score_idx").on(table.score),
  ]
);

export const insertProjectCandidateSchema = createInsertSchema(projectCandidatesTable, {
  status: z.enum(["pending", "approved", "rejected", "merged"]).optional(),
}).omit({ id: true });
export type InsertProjectCandidate = z.infer<typeof insertProjectCandidateSchema>;
export type ProjectCandidate = typeof projectCandidatesTable.$inferSelect;

/**
 * Which findings belong to each candidate.
 */
export const projectCandidateFilesTable = sqliteTable(
  "project_candidate_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => projectCandidatesTable.id, { onDelete: "cascade" }),
    findingId: integer("finding_id")
      .notNull()
      .references(() => findingsTable.id, { onDelete: "cascade" }),
    /** Contribution score for this finding to the candidate's overall score */
    contribution: real("contribution").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("project_candidate_files_candidate_id_idx").on(table.candidateId),
    index("project_candidate_files_finding_id_idx").on(table.findingId),
  ]
);

export type ProjectCandidateFile = typeof projectCandidateFilesTable.$inferSelect;
