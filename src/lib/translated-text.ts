// Page translators swap out text nodes React still holds, so its next insertBefore or removeChild on one throws
// NotFoundError (facebook/react#11538). Append or skip instead.
export const tolerateTranslatedText = () => {
  const { insertBefore, removeChild } = Node.prototype
  Node.prototype.insertBefore = function (node, child) {
    insertBefore.call(this, node, child?.parentNode === this ? child : null)
    return node
  }
  Node.prototype.removeChild = function (child) {
    if (child.parentNode === this) removeChild.call(this, child)
    return child
  }
}
