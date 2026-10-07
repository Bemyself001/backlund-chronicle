// Save data and local engine transactions contain JSON values only.
globalThis.structuredClone ??= value => JSON.parse(JSON.stringify(value));
Object.hasOwn ??= (object, key) => Object.prototype.hasOwnProperty.call(object, key);
Array.prototype.at ??= function (index) { return this[index < 0 ? this.length + index : index]; };
Array.prototype.findLast ??= function (predicate) {
  for (let index = this.length - 1; index >= 0; index--) if (predicate(this[index], index, this)) return this[index];
};
Array.prototype.findLastIndex ??= function (predicate) {
  for (let index = this.length - 1; index >= 0; index--) if (predicate(this[index], index, this)) return index;
  return -1;
};
Array.prototype.toSorted ??= function (compare) { return this.slice().sort(compare); };
String.prototype.replaceAll ??= function (search, replacement) {
  return search instanceof RegExp ? this.replace(search, replacement) : this.split(search).join(replacement);
};
