/** Index children once while preserving their original order and object identity. */
export const indexChildren = <T extends { parent_node: number }>(nodes: readonly T[]) => {
  const childrenByParent = new Map<number, T[]>();
  for (const node of nodes) {
    // Match the strict equality used by the original filter (NaN never matches).
    if (Number.isNaN(node.parent_node)) continue;
    const children = childrenByParent.get(node.parent_node);
    if (children) children.push(node);
    else childrenByParent.set(node.parent_node, [node]);
  }
  return childrenByParent;
};

/** Estimate SVG text widths without browser measurement, including Unicode. */
export const truncateText = (text: string, maxWidth: number, fontSize: number) => {
  const characters = Array.from(text);
  const widthOfCharacter = (char: string) => fontSize * (
    char.charCodeAt(0) > 0xff ? 1 : /[MW@%]/.test(char) ? 0.9 : /[il.,' :]/.test(char) ? 0.3 : 0.65
  );
  // Each prefix is measured once; repeatedly trimming and remeasuring is quadratic.
  const widths = [0];
  for (const char of characters) widths.push(widths[widths.length - 1] + widthOfCharacter(char));
  if (widths[characters.length] <= maxWidth) return text;

  const ellipsisWidth = widthOfCharacter('…');
  let length = characters.length;
  while (length && widths[length] + ellipsisWidth > maxWidth) length--;
  return characters.slice(0, length).join('') + '…';
};
