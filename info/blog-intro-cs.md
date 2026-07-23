<!--
Česká verze článku o aplikaci UMind, vyprávěná na jednom příkladu: plánování výletu.

Obě obrázkové přílohy leží vedle tohoto souboru:

  img-edit.png    — editační režim
  img-graph.png   — prezentační režim

Před publikováním je nahrajte tlačítkem pro obrázky v editoru dev.to a cesty
nahraďte adresami, které dev.to vrátí.

Doporučené štítky: #showdev #javascript #productivity #opensource
-->

# Nová lehká aplikace pro myšlenkové mapy na příkladu plánování výletu

Myšlenková mapa je jedna myšlenka uprostřed a všechno, co na ní visí, kolem ní:
téma, jeho hlavní větve a podrobnosti, které z nich vyrůstají. Za obrázkem přitom
není nic exotičtějšího než strom — kořen, jeho potomci a jejich potomci — tedy
právě ten tvar, který naše poznámky mají už dávno předtím, než je zploštíme do
dokumentu.

**UMind** je malá aplikace pro zápis takového stromu. Každý uzel nese krátký
titulek, jaký se dá přečíst jedním pohledem, a volitelně i delší popis: odstavec
úvahy, tabulku cen, odkaz, kontrolní seznam — zkrátka to, co by jinak skončilo na
okraji papíru a ztratilo se.

Je to doslova statická HTML stránka. Nemá žádný backend ani telemetrii: nic z
toho, co napíšete, neopustí váš počítač, protože není kam by to odcházelo. To má
dva příjemné důsledky. Nic se neinstaluje — buď stránku prostě otevřete, nebo si
složku se šesti soubory zkopírujete na vlastní webový prostor, na firemní disk
nebo na USB klíčenku, a dál funguje i bez připojení. A nikdo se nikam
neregistruje: žádný účet, žádné heslo, žádný potvrzovací e-mail, protože není
server, který by nějaký účet vedl. Mapy se průběžně ukládají v prohlížeči a
tlačítka *Save* / *Open* je přenášejí do obyčejných souborů `.json`, které patří
vám.

Druhým principem je klávesnice. Zapsat myšlenku by nemělo znamenat mířit myší,
takže nový uzel je <kbd>Enter</kbd>, o úroveň hlouběji <kbd>Tab</kbd>, o úroveň
zpět <kbd>Shift</kbd>+<kbd>Tab</kbd> a popis právě vybraného uzlu se otevře
klávesami <kbd>Alt</kbd>+<kbd>Enter</kbd>. Myš je vítaná, ale nikdy nutná. A
protože psát a ukazovat jsou dvě různé činnosti, má tentýž dokument dva režimy:
**editační**, ve kterém je mapa osnovou, do níž se píše, a **prezentační**, ve
kterém se z ní stane obrázek pro ostatní.

## Editační režim: jak plán doopravdy vzniká

![UMind v editačním režimu: osnova výletu vlevo, popis vybraného uzlu vpravo](img-edit.png)

Představme si, že víkendový výlet je právě domluvený a nic jiného ještě ne. Cíl
cesty se stane kořenem a místo okamžitého sbírání odkazů se vyplatí zapsat pět
otázek, které se budou během příprav pořád vracet: jak se tam dostaneme, kde
budeme spát, co chceme vidět, kde se najíme a co je potřeba udělat před odjezdem.
Zabere to půl minuty a mapa tím dostane tvar; každá odpověď, kterou později
najdeme, už má připravené místo.

Odpovědi totiž přicházejí na přeskáčku, jako vždycky. Kolega se zmíní, že starý
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

Cizí osnovu nechce číst nikdo, a tak jedno tlačítko udělá z dokumentu
myšlenkovou mapu: téma uprostřed, větve rozložené na obě strany a každý popis
vykreslený jako poznámka vedle uzlu, ke kterému patří — včetně formátování
Markdownu, tabulek i odkazů. Rozvržení se počítá samo, takže není co přetahovat,
a výsledek se dá stáhnout jako jediný soubor SVG, který otevře libovolný
prohlížeč i telefon a který se dá vytisknout, aniž by zšedl.

Celá výměna pak vypadá takhle: ten, koho vaše nástroje nezajímají, dostane jeden
obrázek, a vám zůstane upravitelný originál v jednom malém souboru.

## Co z toho plyne

Výstupem není mapa, výstupem je rozhodnutí. UMind je postavený přesně na této
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
