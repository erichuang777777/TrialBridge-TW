// A small number of security extensions inject these attributes before React
// hydrates. Remove only their known markers so genuine app mismatches remain visible.
const injectedAttribute = /^(?:bis_skin_checked|bis_register|__processed_[\w-]+__)$/;

function cleanExtensionAttributes(root: ParentNode | Element) {
  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      if (injectedAttribute.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  }
}

cleanExtensionAttributes(document);

const extensionObserver = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "attributes" && record.target instanceof Element && record.attributeName && injectedAttribute.test(record.attributeName)) {
      record.target.removeAttribute(record.attributeName);
    }
    for (const node of record.addedNodes) {
      if (node instanceof Element) cleanExtensionAttributes(node);
    }
  }
});

extensionObserver.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
window.addEventListener("load", () => {
  window.setTimeout(() => {
    cleanExtensionAttributes(document);
    extensionObserver.disconnect();
  }, 2_000);
}, { once: true });
