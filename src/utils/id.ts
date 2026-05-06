/**
 * Lightweight RFC4122-ish v4 id. We avoid the `uuid` npm dep so the plugin
 * stays small. Collisions are vanishingly unlikely at note-scale.
 */
export function generateId(): string {
  const rnd = (n: number) => {
    let s = '';
    const hex = '0123456789abcdef';
    for (let i = 0; i < n; i++) s += hex[Math.floor(Math.random() * 16)];
    return s;
  };
  return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${rnd(3)}-${rnd(12)}`;
}
