import path from "node:path";

const FILE_FIELDS = Object.freeze(["file_path", "path", "target_file", "filename"]);

function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function mappingTargets(value, targets = []) {
  if (Array.isArray(value)) {
    for (const item of value) mappingTargets(item, targets);
    return targets;
  }
  if (!value || typeof value !== "object") return targets;
  for (const field of FILE_FIELDS) if (nonempty(value[field])) targets.push(value[field].trim());
  for (const field of ["edits", "changes", "files"]) if (value[field] !== undefined) mappingTargets(value[field], targets);
  return targets;
}
function patchTargets(patch) {
  if (!nonempty(patch)) return [];
  const targets = [];
  for (const line of patch.split(/\r?\n/u)) {
    const match = line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/u);
    if (match && nonempty(match[1])) targets.push(match[1].trim());
  }
  return targets;
}
function writeFileTargets(tool, mapping) {
  const toolName = String(tool ?? "").toLowerCase();
  const targets = mappingTargets(mapping);
  if (toolName === "apply_patch" || toolName.endsWith("apply_patch")) targets.push(...patchTargets(mapping?.patch ?? mapping?.input ?? ""));
  return [...new Set(targets.map((target) => path.normalize(target)))];
}

export { writeFileTargets };
