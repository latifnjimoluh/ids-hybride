#!/usr/bin/env bash
#
# Installation de Snort 3 dans WSL Ubuntu pour le projet ids-hybride.
# À lancer DANS WSL (Ubuntu) après le redémarrage du PC :
#     bash /mnt/d/Formation/Project/ids-hybride/scripts/install-snort3-wsl.sh
#
# Le script demande le mot de passe sudo une fois. Compilation : 10 à 30 min.
set -euo pipefail

echo "==> 1/7  Dépendances de build"
sudo apt-get update
sudo apt-get install -y \
  build-essential libpcap-dev libpcre2-dev libpcre3-dev libnet1-dev zlib1g-dev \
  luajit hwloc libdumbnet-dev bison flex liblzma-dev \
  openssl libssl-dev pkg-config libhwloc-dev cmake cpputest \
  libsqlite3-dev uuid-dev libcmocka-dev libnetfilter-queue-dev \
  libmnl-dev autotools-dev libluajit-5.1-dev libunwind-dev libfl-dev \
  git wget python3-venv python3-pip

# Ubuntu fournit le header sous dumbnet.h ; certains builds cherchent dnet.h
if [ -f /usr/include/dumbnet.h ] && [ ! -e /usr/include/dnet.h ]; then
  sudo ln -s /usr/include/dumbnet.h /usr/include/dnet.h
fi

SRC="$HOME/snort_src"
mkdir -p "$SRC"

echo "==> 2/7  libDAQ"
cd "$SRC"
if [ ! -d libdaq ]; then git clone https://github.com/snort3/libdaq.git; fi
cd libdaq
./bootstrap
./configure
make -j"$(nproc)"
sudo make install

echo "==> 3/7  gperftools (tcmalloc)"
sudo apt-get install -y libgoogle-perftools-dev || true

echo "==> 4/7  Snort 3 (compilation)"
cd "$SRC"
if [ ! -d snort3 ]; then git clone https://github.com/snort3/snort3.git; fi
cd snort3
./configure_cmake.sh --prefix=/usr/local --enable-tcmalloc
cd build
make -j"$(nproc)"
sudo make install
sudo ldconfig

echo "==> 5/7  Vérification"
snort -V

echo "==> 6/7  Configuration (snort.lua minimal + règles de test)"
sudo mkdir -p /usr/local/etc/snort/rules /var/log/snort

# Règles de test locales (SID >= 1000000)
sudo tee /usr/local/etc/snort/rules/local.rules >/dev/null <<'RULES'
alert icmp $EXTERNAL_NET any -> $HOME_NET any ( msg:"ICMP Ping detecte"; itype:8; sid:1000001; rev:1; )
alert tcp $EXTERNAL_NET any -> $HOME_NET 22 ( msg:"Connexion SSH entrante"; flow:to_server; sid:1000002; rev:1; )
alert http $EXTERNAL_NET any -> $HOME_NET any ( msg:"Requete HTTP - test"; flow:to_server,established; sid:1000003; rev:1; )
RULES

# snort.lua minimal qui charge les defaults, nos regles, et la sortie JSON
sudo tee /usr/local/etc/snort/snort.lua >/dev/null <<'LUA'
require('snort_defaults')

HOME_NET = '192.168.0.0/16'
EXTERNAL_NET = 'any'

stream = { }
stream_tcp = { }
stream_udp = { }
stream_ip = { }
http_inspect = { }
normalizer = { }

ips =
{
    variables = default_variables,
    rules = [[
        include /usr/local/etc/snort/rules/local.rules
    ]],
}

alert_json =
{
    file = true,
    limit = 100,
    fields = 'timestamp action class msg priority proto src_addr src_port \
              dst_addr dst_port service rule sid gid rev dir',
}
LUA

echo "==> 7/7  Vérification du binaire"
# Ce snort.lua par défaut sert seulement de repère ; le projet utilise sa
# propre config (config/snort.lua). Validation non bloquante.
SNORT_LUA_PATH=/usr/local/etc/snort snort -c /usr/local/etc/snort/snort.lua -T \
  || echo "(config par défaut non validée ; la config du projet le sera au démarrage)"

echo ""
echo "======================================================================"
echo " Snort 3 installe et valide."
echo " Binaire : $(command -v snort)"
echo " Config  : /usr/local/etc/snort/snort.lua"
echo " Regles  : /usr/local/etc/snort/rules/local.rules"
echo " Logs    : /var/log/snort/"
echo ""
echo " Etape suivante : configurer le service systemd puis lancer le backend"
echo " (voir guide-05-passage-en-reel-wsl.md)."
echo "======================================================================"
