#!/bin/sh
# Une las piezas de tools/src en site/index.html (sin compilación) y actualiza version.txt
set -e
D=$(cd "$(dirname "$0")/.." && pwd); S=$D/tools/src; O=$D/site
cat $S/head.html $S/body.html $S/app1.js $S/app2.js $S/app3.js $S/app4.js > $O/index.html
grep -o "const VER = '[^']*'" $S/app1.js | cut -d"'" -f2 > $O/version.txt
echo "index.html $(wc -c < $O/index.html) bytes · versión $(cat $O/version.txt)"
