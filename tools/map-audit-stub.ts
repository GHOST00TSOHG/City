// Evaluated first: gives browser-only globals a harmless value so src modules can be imported in node.
(globalThis as any).location ??= { search: '', href: 'http://localhost/' };
(globalThis as any).window ??= globalThis;
export {};
