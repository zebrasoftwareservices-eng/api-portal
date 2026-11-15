// SPDX-License-Identifier: Apache-2.0
// Hex components avoid collisions and URL-fragment punctuation, including Unicode paths.
export function anchorPart(value: string) {
  return Array.from(value, (character) =>
    character.codePointAt(0)!.toString(16),
  ).join('-');
}
export function operationSlug({
  method,
  path,
}: {
  method: string;
  path: string;
}) {
  return `${method.toLowerCase()}-${anchorPart(path)}`;
}
export function operationAnchor(operation: {
  method: string;
  path: string;
  tags?: string[];
}) {
  const tag = operation.tags?.[0];
  // Scalar adds the document slug internally, then strips it from single-document URLs.
  return `${tag ? `tag/${anchorPart(tag)}/` : ''}${operationSlug(operation)}`;
}
