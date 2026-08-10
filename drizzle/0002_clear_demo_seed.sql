DELETE FROM `clients`
WHERE `id` IN (
  'demo-client-tenerife',
  'demo-client-gran-canaria',
  'demo-client-lanzarote',
  'demo-client-fuerteventura',
  'demo-client-la-palma'
);
--> statement-breakpoint
DELETE FROM `users`
WHERE `id` IN (
  'demo-manager-tenerife',
  'demo-agent-tenerife',
  'demo-agent-gran-canaria',
  'demo-manager-lanzarote'
);
