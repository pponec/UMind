<!--
Česká verze článku o aplikaci UMind, vyprávěná na jednom příkladu: plánování výletu.

Obě obrázkové přílohy leží vedle tohoto souboru:

  img-edit.png    — editační režim
  img-graph.png   — prezentační režim

Před publikováním je nahrajte tlačítkem pro obrázky v editoru dev.to a cesty
nahraďte adresami, které dev.to vrátí.

Doporučené štítky: #showdev #javascript #productivity #opensource
-->

<div style="margin-top: 10px; margin-left: 10px; width: 800px;">

# UMind: lehká aplikace pro myšlenkové mapy na příkladu plánování výletu

Myšlenková mapa je vizuální nástroj pro uspořádání myšlenek, plánování i efektivnější
učení: místo zdlouhavého psaní textu využívá stromovou strukturu. Všechno začíná
hlavním tématem, z něhož vycházejí hlavní větve představující klíčové oblasti, a z nich
se dále rozvětvují podrobnější poznámky, nápady či příklady. Tento styl přirozeně
napodobuje způsob, jakým mozek pracuje s asociacemi, díky čemuž na první pohled uvidíte
souvislosti a informace si mnohem snáze zapamatujete.

**UMind** je malá aplikace pro zápis takového stromu. Každý uzel nese krátký
titulek, který se dá přečíst jedním pohledem, a volitelně i delší popis: odstavec
úvahy, tabulku cen, odkaz, kontrolní seznam — zkrátka to, co by jinak skončilo na
okraji papíru a ztratilo se.

Celá aplikace je statická webová stránka: pár souborů HTML, JavaScriptu a CSS, žádný
build, žádné závislosti. Nemá serverový backend ani telemetrii, takže nic z toho, co
napíšete, neopustí váš počítač. To má dva příjemné důsledky. Nic se neinstaluje —
buď stránku otevřete na webu, nebo si složku se soubory zkopírujete na vlastní webový
prostor, na firemní disk či na USB klíčenku a aplikace pak funguje i bez připojení.
A nikdo se nikam neregistruje: žádný účet, žádné heslo, žádný potvrzovací e-mail —
není totiž server, který by nějaký účet vedl.

Mapy se průběžně ukládají do úložiště prohlížeče (`localStorage`), takže žijí v jednom
prohlížeči na jednom počítači; když v něm smažete data webu, zmizí i mapy. Tlačítko
*Save* proto uloží celý dokument do textového souboru `.json`, který patří vám,
a tlačítko *Open* ho zase načte zpátky — třeba na jiném počítači.

Aplikaci lze pustit i lokálně, bez internetu. V projektu najdete dva pomocné skripty,
které rozjedou malý webový server: jeden potřebuje Python 3 (`python3 run.py`), druhý
Javu 17+ (`java Run.java`); oba pak stránku vydávají na `http://localhost:8000/`.
Otevřít `index.html` rovnou z disku přes `file://` sice také jde, ale některé prohlížeče
tam `localStorage` vypínají a mapa se pak sama neuloží — proto je místní server lepší
volba.

Při psaní má přednost klávesnice. Další uzel na stejné úrovni vytvoříte klávesou
<kbd>Enter</kbd>, o úroveň hlouběji se zanoříte klávesou <kbd>Tab</kbd> a zpět nahoru
se dostanete kombinací <kbd>Shift</kbd>+<kbd>Tab</kbd>; dialog s podrobným popisem
právě vybraného uzlu otevřete pomocí <kbd>Alt</kbd>+<kbd>Enter</kbd>. Myš se hodí na
přetažení celé větve jinam (za úchyt v levém okraji uzlu) nebo na sbalení té hotové.
Obsah mapy se zapisuje v editačním režimu a jedním tlačítkem (*Show graph*) se převede
do grafické podoby v prezentačním režimu. Rozhraní aplikace je anglické, jak je vidět
i na obrázcích níže.

## Editační režim: jak vzniká plán

![UMind v editačním režimu: osnova výletu vlevo, popis vybraného uzlu vpravo](img-edit.png)

Představme si, že s týmem plánujeme zážitkový víkend, ale zatím neznáme detaily.
Cíl cesty se stane kořenem myšlenkové mapy. Hned můžeme zapsat také několik základních
otázek, na které chceme hledat odpověď: jak se tam dostaneme, kde budeme spát, co chceme
vidět, kde se najíme a co je potřeba udělat před odjezdem. Zabere to jen chvíli, ale mapa
tím dostane tvar; každá odpověď, kterou později najdeme, už má v mapě své místo.

Odpovědi běžně přicházejí na přeskáčku. Kolega se zmíní, že starý most stojí za vidění
při východu slunce — vznikne tedy potomek uzlu *What to see* (Co chceme vidět) a důvod,
proč zrovna za rozbřesku, tedy ta část, na kterou se nejčastěji zapomíná, putuje do
jeho popisu.
Srovnání vlaku, nočního autobusu a letadla skončí jako malá tabulka v popisu uzlu
*Getting there* (Jak se tam dostaneme), spolu s jedinou větou, která to rozhoduje:
vyhrává vlak, protože jede z centra do centra. O týden později je tabulka pořád na svém
místě, takže nikdo nemusí znovu otevírat pět záložek, aby si vzpomněl, proč byl noční
autobus za 19 eur zamítnutý.

Sama osnova se přitom celou dobu hýbe. *Beer garden by the river* (Pivní zahrádka
u řeky) se nejdřív objeví pod památkami a nenápadně se přestěhuje pod *Food & drink*
(Jídlo a pití); klávesy <kbd>Alt</kbd>+<kbd>↑</kbd> přeskládají uzly na stejné úrovni
ve chvíli, kdy se ukáže, že jídlo je důležitější než hrady; a hotovou větev lze sbalit,
aby dostaly prostor ty nedořešené. Titulky zůstanou přehledné, rešerše po ruce a plán
přestane bydlet na šesti místech zároveň.

## Prezentační režim: tentýž dokument jako obrázek

![Tatáž mapa v prezentačním režimu: kořen uprostřed, větve na obě strany, popisy vykreslené jako poznámky](img-graph.png)

Ze surových textových poznámek pak vytvoříme jedním tlačítkem úhledný graf. Hlavní téma
je uprostřed, související větve jsou rozložené rovnoměrně po obou stranách a vedle uzlů
se vykreslí i jejich podrobné poznámky — ty lze formátovat základními značkami
Markdownu. Rozvržení počítá aplikace, takže ve výsledku už není co přetahovat. Hotový
graf se dá stáhnout jako jediný soubor SVG, který otevře libovolný prohlížeč i mobilní
telefon.

S kolegy pak lze sdílet buď ten hotový obrázek, nebo rovnou data v textovém formátu
JSON, která si každý může dál upravovat ve své vlastní kopii aplikace. Takový soubor se
dá sdílet třeba v gitovém repozitáři.

## Co z toho plyne

Konečným cílem není graf myšlenkové mapy, ale rozhodnutí. UMind je postavený přesně
na této myšlence: osnova je místo, kde se přemýšlí, obrázek je to, co se předává, a obojí
jsou soubory, které vlastníte. Žádný účet, který je potřeba založit, žádná služba,
které je potřeba věřit, nic k instalaci a nic, co přestane fungovat, až nějaká
firma změní plány.

Pokud si to chcete zkusit, uvítací mapa s návodem je na adrese
[pponec.github.io/UMind/?welcome](https://pponec.github.io/UMind/?welcome) a
zdrojový kód — čistý JavaScript, žádný framework, žádný build, licence Apache
2.0 — najdete na [GitHubu](https://github.com/pponec/UMind).

Zkuste to na prvním plánu, který vám zrovna leží na stole — víkendový výlet, rešerše,
příprava přednášky. Než ho poskládáte celý, možná zjistíte, že vám poprvé po dlouhé
době nechybí žádná záložka.

</div>
