import type { Database } from "bun:sqlite";
import type { Tag, TagInput } from "../../../core/types";
import { AppError, writeRow, type WriteContext } from "./repo";
import { forgetSettings } from "./settings";

export function listTags(db: Database): Tag[] {
	return db.query("SELECT * FROM tags WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all() as Tag[];
}

export function getTag(db: Database, id: string): Tag | null {
	return db.query("SELECT * FROM tags WHERE id = ?").get(id) as Tag | null;
}

export function findTagByName(db: Database, name: string): Tag | null {
	return db
		.query("SELECT * FROM tags WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL")
		.get(name.trim()) as Tag | null;
}

/**
 * Creates or updates a tag. Creating a tag with the name of a live tag returns
 * that tag (the combobox "type a name and press Enter" flow).
 */
export function saveTag(db: Database, ctx: WriteContext, input: TagInput): Tag {
	const name = input.name.trim();
	if (name === "") throw new AppError("TAG_NAME_EMPTY");
	const sameName = findTagByName(db, name);
	if (!input.id) {
		if (sameName) return sameName;
		return writeRow<Tag>(db, ctx, "tags", { id: Bun.randomUUIDv7(), name, color: input.color ?? null });
	}
	const existing = getTag(db, input.id);
	if (!existing || existing.deleted_at !== null) throw new AppError("TAG_NOT_FOUND");
	if (sameName && sameName.id !== existing.id) throw new AppError("TAG_NAME_TAKEN");
	return writeRow<Tag>(db, ctx, "tags", {
		...existing,
		name,
		color: input.color === undefined ? existing.color : input.color,
	});
}

/** Soft-deletes the tag and its entry_tags rows. The entries stay. */
export function deleteTag(db: Database, ctx: WriteContext, id: string): void {
	db.transaction(() => {
		const tag = getTag(db, id);
		if (!tag || tag.deleted_at !== null) return;
		const now = ctx.now();
		writeRow(db, ctx, "tags", { ...tag, deleted_at: now });
		// The default tags drop deleted tags.
		forgetSettings(db);
		const links = db
			.query("SELECT * FROM entry_tags WHERE tag_id = ? AND deleted_at IS NULL")
			.all(id) as Record<string, unknown>[];
		for (const link of links) writeRow(db, ctx, "entry_tags", { ...link, deleted_at: now });
	})();
}
