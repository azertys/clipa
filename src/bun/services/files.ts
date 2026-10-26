import { writeFileSync } from "node:fs";
import { join, parse } from "node:path";

/**
 * Writes content to a new file in dir and returns its path. An existing file is never
 * replaced: the name gets " (2)", " (3)" and so on.
 */
export function writeNewFile(dir: string, name: string, content: string): string {
	const { name: base, ext } = parse(name);
	for (let n = 1; n < 1000; n++) {
		const path = join(dir, n === 1 ? name : `${base} (${n})${ext}`);
		try {
			writeFileSync(path, content, { flag: "wx" });
			return path;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
		}
	}
	throw new Error(`writeNewFile: no free name for ${name} in ${dir}`);
}
