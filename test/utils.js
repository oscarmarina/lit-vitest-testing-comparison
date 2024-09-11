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
 * Returns the outerHTML or innerHTML of a node after removing specified attributes from it and its children.
 *
 * If the initial node is an HTMLElement, the function returns the outerHTML of the node.
 * If the initial node is a ShadowRoot, the function returns the innerHTML of the node.
 *
 * @param {Node} node - The initial node.
 * @param {string[]} ignoreAttributes - The attributes to remove from the node and its children.
 * @returns {string} The outerHTML or innerHTML of the node after removing the specified attributes.
 */
export const structureSnapshot = (node, ignoreAttributes = []) => {
  const initialNodeIsHTMLElement = node instanceof HTMLElement;
  const initialNodeIsShadowRoot = node instanceof ShadowRoot;

  /**
   * Removes specified attributes from an HTML node and its children.
   * @param {Node} currentNode - The node to remove the attributes from.
   */
  const removeAttributes = (currentNode) => {
    if (currentNode && ignoreAttributes && Array.isArray(ignoreAttributes)) {
      if (
        currentNode instanceof HTMLElement &&
        currentNode.nodeType !== 3 &&
        currentNode.nodeType !== 8
      ) {
        ignoreAttributes.forEach((attr) => currentNode.removeAttribute(attr));
      }

      // Look for HTMLElements in its children.
      Array.from(currentNode.childNodes).forEach((child) => removeAttributes(child));
    }
  };

  removeAttributes(node);

  // If the initial node is an HTMLElement, return the outerHTML after removing comments and formatting.
  // If the initial node is a ShadowRoot, return the innerHTML after removing comments and formatting.
  let result = '';
  if (initialNodeIsHTMLElement) {
    result = removeCommentsAndFormat(node ? node.outerHTML : '');
  } else if (initialNodeIsShadowRoot) {
    result = removeCommentsAndFormat(node ? node.innerHTML : '');
  }

  return result;
};
