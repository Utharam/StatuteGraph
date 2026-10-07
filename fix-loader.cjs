const fs = require('fs');
let code = fs.readFileSync('src/services/aknLoader.ts', 'utf8');
code = code.replace(
  /for \(const prov of dataset\.provisions\) \{/g,
  `for (const prov of dataset.provisions) {\n    prov.children = [];`
);

code = code.replace(
  `const rootProvisions = dataset.akomaNtoso?.act?.body || dataset.provisions.filter(p => !p.parent_eid);`,
  `const rootProvisions: Provision[] = [];\n  for (const prov of dataset.provisions) {\n    if (prov.parent_eid && provisionsByEid.has(prov.parent_eid)) {\n      provisionsByEid.get(prov.parent_eid)!.children!.push(prov);\n    } else if (!prov.parent_eid) {\n      rootProvisions.push(prov);\n    }\n  }`
);
fs.writeFileSync('src/services/aknLoader.ts', code);
