-- Ejecutar en Supabase Logs Explorer, NO en el SQL Editor de PostgreSQL.
-- Solo agregados de las ultimas 24 horas; nunca seleccionar log_attributes completo.
select
  log_attributes['request.path'] as route,
  toInt32OrZero(log_attributes['response.status_code']) as status,
  count() as samples,
  avg(toFloat64OrNull(log_attributes['response.origin_time'])) as avg_ms,
  quantile(0.95)(toFloat64OrNull(log_attributes['response.origin_time'])) as p95_ms
from logs
where source='edge_logs'
  and timestamp>=now()-interval 24 hour
  and log_attributes['request.path'] in('/auth/v1/token','/auth/v1/signup')
group by route,status
order by samples desc
limit 20;
