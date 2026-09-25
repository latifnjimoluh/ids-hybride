---------------------------------------------------------------------------
-- snort.lua : configuration autonome du projet ids-hybride
-- Charge les valeurs par défaut par chemin absolu (dofile) pour ne pas
-- dépendre de SNORT_LUA_PATH. Editable par le dashboard (fichier sur /mnt/d).
---------------------------------------------------------------------------

-- Les variables réseau doivent être définies AVANT le chargement des défauts,
-- pour que default_variables (nets) les capture et les expose aux règles.
-- 'any' pour capter tout le trafic de l'interface WSL (NAT en 172.x).
-- À restreindre au vrai réseau à protéger en déploiement réel.
HOME_NET = 'any'
EXTERNAL_NET = 'any'

dofile('/usr/local/etc/snort/snort_defaults.lua')

---------------------------------------------------------------------------
-- Inspecteurs (réassemblage + normalisation)
---------------------------------------------------------------------------
stream = { }
stream_ip = { }
stream_icmp = { }
stream_tcp = { }
stream_udp = { }
http_inspect = { }
normalizer = { }

wizard = default_wizard

binder =
{
    { when = { proto = 'tcp', service = 'http' }, use = { type = 'http_inspect' } },
    { use = { type = 'wizard' } },
}

---------------------------------------------------------------------------
-- Détection (règles locales du projet)
---------------------------------------------------------------------------
ips =
{
    variables = default_variables,
    rules = [[
        include /mnt/d/Formation/Project/ids-hybride/config/local.rules
    ]],
}

---------------------------------------------------------------------------
-- Sortie JSON (consommée par le dashboard et un éventuel SIEM)
---------------------------------------------------------------------------
alert_json =
{
    file = true,
    limit = 100,
    fields = 'timestamp action class msg priority proto src_addr src_port \
              dst_addr dst_port service rule sid gid rev dir',
}
