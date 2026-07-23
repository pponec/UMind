<!--
Česká verze článku o aplikaci UMind, vyprávěná na jednom příkladu: plánování výletu.

Obě obrázkové přílohy leží vedle tohoto souboru:

  img-edit.png    — editační režim
  img-graph.png   — prezentační režim

Před publikováním je nahrajte tlačítkem pro obrázky v editoru dev.to a cesty
nahraďte adresami, které dev.to vrátí.

Doporučené štítky: #showdev #javascript #productivity #opensource
-->

# Nová lehká aplikace UMind pro tvorbu myšlenkové mapy na příkladu plánování výletu

Myšlenková mapa je skvělý vizuální nástroj pro uspořádání myšlenek, plánování i efektivnější učení, který místo zdlouhavého psaní textu  využívá  stromovou strukturu. Vše začíná hlavním témate tématem, z něhož  vycházejí hlavní větve představující klíčové oblasti a z nich se dále rozvětvují další a podrobnější poznámky, myšlenky či příklady. Tento styl přirozeně napodobuje fungování našeho mozku a asociací, díky čemuž na první pohled uvidíte všechny souvislosti a informace si mnohem snáze zapamatujete.

**UMind** je malá aplikace pro zápis takového stromu. Každý uzel nese krátký
titulek, jaký se dá přečíst jedním pohledem, a volitelně i delší popis: odstavec
úvahy, tabulku cen, odkaz, kontrolní seznam — zkrátka to, co by jinak skončilo na
okraji papíru a ztratilo se.

Je to doslova jediná statická HTML stránka. Nemá žádný serverový backend ani telemetrii a nic z
toho, co napíšete, neopustí váš počítač. To má
dva pozitivní důsledky. Aplikace se nemusí instalovat: buď stránku prostě otevřete, nebo si
složku s (pomocnými soubory zkopírujete na vlastní webový prostor, na firemní disk
nebo na USB klíčenku, a dál funguje i bez připojení. A nikdo se nikam
neregistruje: žádný účet, žádné heslo, žádný potvrzovací e-mail, nic z toho není potřeba. 
Data se průběžně ukládají v prohlížeči a
tlačítka *Save* / *Open* je lze přenést do lokálních textových souborů typu `.json`, které je pak možné přenést na jiný počítač.

Pokud snad nemáte připojení k internetu, aplikaci lze pustit i lokálně. V projektu apliakce UMidn si můžete vybrat jeden ze dovu skritů pro lokální spuštění. Pro jeden potřebujete Python (v3), pro Javu (v17+).

Pro vytváření dat se zde preferovaná klávesnice. 
Sourozence uzlu tedy vytvoříe klávesou<kbd>Enter</kbd> a pro zanoření do hloubky se použije klávesa  <kbd>Tab</kbd>.
Pro posun zpět na vysší úroveň se použije klávesa <kbd>Shift</kbd>+<kbd>Tab</kbd> a dialog pro detailní popis aktuáilně vybraného aktivujeme klávesami  <kbd>Alt</kbd>+<kbd>Enter</kbd>. 
Myš bude užitečná pro pro přesun stromové struktyry do jiného uzlu.
Obsah mapy se zapisuje v editačním režimu a takto vytvořená data lze převést do grafické podoby v prezentačním režimu.


## Editační režim: jak vzniká plán  

![UMind v editačním režimu: osnova výletu vlevo, popis vybraného uzlu vpravo](img-edit.png)

Představme si, plánujeme s týmem zážitovový víkend , ale zatím neznáme  detaily. 
Cíl cesty bude stane kořenem myšlenové mapy. 
Hned můžeme  zapsat také několik základních otázek, na které chceme hledat  odpověď: jak se tam dostaneme, kde
budeme spát, co chceme vidět, kde se najíme a co je potřeba udělat před odjezdem.
Zabere to jen chvíli, ale mapa tím dostane tvar; každá odpověď, kterou později
najdeme, už má v mapě své místo místo.

Odpovědi běžně přicházejí na přeskáčk. Kolega se zmíní, že starý
most stojí za vidění při východu slunce — vznikne tedy potomek uzlu *What to
see* a důvod, proč zrovna za rozbřesku (což je ta část, na kterou se zapomíná),
putuje do jeho popisu. Srovnání vlaku, nočního autobusu a letadla skončí jako
malá tabulka v popisu uzlu *Getting there*, spolu s jedinou větou, která to
rozhoduje: vyhrává vlak, protože jede z centra do centra. O týden později je
tabulka pořád na svém místě, takže nikdo nemusí znovu otevírat pět záložek, aby
si vzpomněl, proč byl noční autobus za 19 eur zamítnutý.

Sama osnova se přitom celou dobu hýbe. *Beer garden by the river* začne život pod
památkami a nenápadně se přestěhuje pod *Food & drink*, klávesy
<kbd>Alt</kbd>+<kbd>↑</kbd> přeskládají sourozence ve chvíli, kdy se ukáže, že
jídlo je důležitější než hrady, a hotovou větev lze sbalit, aby dostaly prostor
ty nedořešené. Titulky zůstanou přehledné, rešerše po ruce a plán přestane
bydlet na šesti místech zároveň.

## Prezentační režim: tentýž dokument jako obrázek

![Tatáž mapa v prezentačním režimu: kořen uprostřed, větve na obě strany, popisy vykreslené jako poznámky](img-graph.png)

Ze surových textových poznámek pak vytvoříme jedním tlačítkem pěkně zpracovaný graf.
Hlavní téma bude uprostřed, související větve budou rozložené rovnoměrně po obou stranách, včetně detailních poznámek. 
Poznámky lze formáttovat základními značkami z Markdown.. Rozvržení  počítá aplikace a tak ve výsledku už není co přetahovat.
Výsledek pak lze stáhnout jako jediný soubor SVG, který otevře libovolný
prohlížeč i mobilní telefon.

S kolegy lze sdílet ten hotový graf, nebo jen data (v textovém formátu JSON), který si může upravovat ve stejné aplikaci každý sám. Data lze sdílet napříkad v Git repozitáři .

## Co z toho plyne

Konečným cílem však není graf myšlenkové mapy, ale rozhodnutí. UMind je postavený přesně na této
myšlence: osnova je místo, kde se přemýšlí, obrázek je to, co se předává, a obojí
jsou soubory, které vlastníte. Žádný účet, který je potřeba založit, žádná služba,
které je potřeba věřit, nic k instalaci a nic, co přestane fungovat, až nějaká
firma změní plány. Výlet mimochodem dopadl výborně a v sobotu pršelo přesně tak,
jak to mapa předpovídala.

Pokud si to chcete zkusit, průvodní uvítací mapa je na adrese
[pponec.github.io/UMind/?welcome](https://pponec.github.io/UMind/?welcome) a
zdrojový kód — čistý JavaScript, žádný framework, žádný build, licence Apache
2.0 — najdete na [GitHubu](https://github.com/pponec/UMind).

A zajímá mě druhá polovina příběhu: kde právě teď bydlí ten váš rozdělaný plán —
v aplikaci, v textovém souboru, nebo v konverzaci, kterou pořád rolujete zpátky?
