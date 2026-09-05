const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL + '&audience=npm:registry.npmjs.org';
const res = await fetch(url, {
  headers: { Authorization: 'bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN },
});
const { value } = await res.json();
const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());
const shown = {};
for (const key of [
  'repository',
  'repository_owner',
  'workflow_ref',
  'job_workflow_ref',
  'environment',
  'ref',
  'sub',
  'aud',
  'iss',
])
  shown[key] = claims[key];
console.log('claims:', JSON.stringify(shown, null, 2));
for (const name of ['zomboid-models', 'zomboid-models-render']) {
  const r = await fetch(
    'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/' + encodeURIComponent(name),
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + value, 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  const text = await r.text();
  console.log(name, r.status, text.replace(/"token":"[^"]+"/, '"token":"(hidden)"').slice(0, 400));
}
