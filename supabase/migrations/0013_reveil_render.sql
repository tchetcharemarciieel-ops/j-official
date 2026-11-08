-- Réveil du site sur l'offre gratuite de Render : une petite visite toutes les 10 minutes
-- empêche le service de s'endormir (sinon environ 1 minute d'attente à la première visite).
-- Un seul service Render gratuit : il tient dans les 750 heures gratuites par mois.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('minisoft-reveil-render', '*/10 * * * *', $$select net.http_get('https://minisoft-rca.onrender.com/robots.txt')$$);
