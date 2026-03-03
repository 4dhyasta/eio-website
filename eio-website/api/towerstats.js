export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const response = await fetch('https://api.towerstats.com/api/game_badges', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apiKey': '12e8fc20-0162-4eec-af87-377d1f5286e0-5a60a5b8-da15-475b-a2ca-ee92c4ba1143'
    },
    body: JSON.stringify(req.body)
  });

  const data = await response.json();
  res.status(200).json(data);
}
```

**2. Di `dashboard.html`**, ganti URL sync dari:
```
https://api.towerstats.com/api/game_badges
```
jadi:
```
/api/towerstats