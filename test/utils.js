/**
 * Removes all HTML comment nodes from a string.
 *
 * @param {string} cnode - The string to remove comment nodes from.
 * @returns {string} The string with all comment nodes removed.
 */
const removeComments = (cnode) => (cnode || '').replace(/<!--[\s\S]*?-->/g, '');

/**
 * Removes all HTML comment nodes from a string and formats the string to be on one line.
 *
 * @param {string} cnode - The string to remove comment nodes from and format.
 * @returns {string} The string with all comment nodes removed and formatted to be on one line.
 */
const removeCommentsAndFormat = (cnode) => removeComments(cnode).replace(/\s\s+/g, '');

/**
 * Removes specified attributes from an HTML node and its children.
 * @param {Node} currentNode - The node to remove the attributes from.
 * @param {string[]} ignoreAttributes - The attributes to remove from the node and its children.
 */
const removeAttributes = (currentNode, ignoreAttributes) => {
  if (
    (currentNode?.nodeType === 1 || currentNode?.nodeType === 11) &&
    Array.isArray(ignoreAttributes)
  ) {
    if (currentNode.nodeType === 1) {
      ignoreAttributes.forEach((attr) =>
        /** @type {HTMLElement} */ (currentNode).removeAttribute(attr)
      );
    }
    [...currentNode.childNodes].forEach((child) => removeAttributes(child, ignoreAttributes));
  }
};

/**
 * Returns the outerHTML or innerHTML of a node after removing specified attributes from it and its children.
 *
 * If the initial node is an HTMLElement, the function returns the outerHTML of the node.
 * If the initial node is a ShadowRoot, the function returns the innerHTML of the node.
 *
 * @param {Node} node - The initial node.
 * @param {string[]} ignoreAttributes - The attributes to remove from the node and its children.
 * @returns {string} The outerHTML or innerHTML of the node after removing the specified attributes.
 */
export const htmlStructureSnapshot = (node, ignoreAttributes = []) => {
  const isHTMLElement = node instanceof HTMLElement;
  const isShadowRoot = node instanceof ShadowRoot;

  if (isHTMLElement || isShadowRoot) {
    if (ignoreAttributes.length > 0) {
      removeAttributes(node, ignoreAttributes);
    }

    const htmlContent = isShadowRoot ? node.innerHTML : node.outerHTML;
    return removeCommentsAndFormat(htmlContent);
  }
  return '';
};
