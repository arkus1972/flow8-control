// English for FLOW 8 Control. The app is written in Polish; with English chosen, every text that reaches the
// screen (page text, buttons, labels, toasts, prompts) goes through tr(): whole known sentences first, then
// known pieces of sentences. Names the user gave (channels, songs, presets, scenes) are left alone (data-notr).
(function () {
  'use strict';
  const D = [
    // ----- menu, bars, display -----
    ['Połącz z mikserem', 'Connect to the mixer'], ['Połączenie', 'Connection'], ['Pamięć', 'Memory'], ['Narzędzia', 'Tools'],
    ['Ustawienia', 'Settings'], ['Połącz', 'Connect'], ['Rozłącz', 'Disconnect'], ['Kabel USB', 'USB cable'],
    ['Sceny', 'Scenes'], ['Presety', 'Presets'], ['Setlista', 'Setlist'], ['Zablokuj ekran', 'Lock screen'],
    ['Wyślij do miksera', 'Send to mixer'], ['Pomiar', 'Measure'], ['Mikser', 'Mixer'], ['Aplikacja', 'App'],
    ['Zablokowane. Przytrzymaj kłódkę, aby odblokować.', 'Locked. Hold the padlock to unlock.'],
    ['Przytrzymaj, aby odblokować', 'Hold to unlock'], ['Odblokowane', 'Unlocked'],
    ['Wysyłaj tempo do efektu w mikserze', 'Send the tempo to the mixer effect'], ['Wystukaj', 'Tap'],
    ['Kanały miksera', 'Mixer channels'], ['Kanały', 'Channels'], ['Który miks ustawiasz', 'Which mix you set'],
    ['Metronom', 'Metronome'], ['Metrum', 'Time signature'], ['Przełącz motyw jasny lub ciemny', 'Switch light or dark theme'],
    ['Sceny zapisane w mikserze', 'Scenes stored in the mixer'], ['Strony kanałów', 'Channel pages'],
    ['Szybciej o 1', 'Faster by 1'], ['Wolniej o 1', 'Slower by 1'], ['Tempo w uderzeniach na minutę', 'Tempo in beats per minute'],
    ['Wersja aplikacji', 'App version'], ['Wyświetlacz', 'Display'], ['Zmień widok: pełny, same suwaki, same wskaźniki', 'Change view: full, faders only, meters only'],
    ['Motyw', 'Theme'], ['Widok', 'View'], ['Widok pełny', 'Full view'], ['Widok: same suwaki', 'View: faders only'],
    ['Widok: same wskaźniki', 'View: meters only'], ['Wskaźniki poziomu', 'Level meters'],
    ['odsłuch 1', 'monitor 1'], ['odsłuch 2', 'monitor 2'], ['efekt 1', 'effect 1'], ['efekt 2', 'effect 2'],
    ['miks: ', 'mix: '], ['sala', 'main'], ['sali', 'main'], ['poziom ', 'level '], ['wysyłka ', 'send '], ['pan ', 'pan '],
    ['Pokaż kanał ', 'Show channel '], ['Kanał ', 'Channel '], ['Przytrzymaj, aby zmienić nazwę', 'Hold to rename'],
    ['Tap tempo efektu', 'Effect tap tempo'], ['Wczytaj scenę ', 'Load scene '], [' z miksera', ' from the mixer'],
    ['Wycisz ', 'Mute '], ['Wyjście ', 'Output '], [' do: ', ' to: '], ['zablokowany', 'locked'],
    // ----- connection -----
    ['Połączono, ale mikser nie odpowiada.', 'Connected, but the mixer does not answer.'], ['Nie udało się połączyć: ', 'Could not connect: '],
    ['Ta przeglądarka nie obsługuje Bluetooth. Użyj Chrome na Androidzie.', 'This browser has no Bluetooth. Use Chrome on Android.'],
    ['Łączę… próba ', 'Connecting… attempt '],
    ['Połączono przez Bluetooth, ale tylko w jedną stronę: telefon nie odbiera danych z miksera.', 'Connected over Bluetooth, but one way only: the phone gets no data from the mixer.'],
    ['Nie udało się połączyć (', 'Could not connect ('], ['). Zamknij FLOW Mix, wyłącz i włącz Bluetooth, spróbuj ponownie.', '). Close FLOW Mix, switch Bluetooth off and on, try again.'],
    ['Odbiór z miksera działa.', 'Receiving from the mixer works.'],
    ['Połączono przez Bluetooth. Rusz suwakiem na mikserze, a aplikacja go pokaże.', 'Connected over Bluetooth. Move a fader on the mixer and the app shows it.'],
    ['Uwaga: limiter (', 'Note: the limiter ('], [') ma niski próg i mocno ścisza głośne dźwięki. Zmienisz to w Ustawieniach miksera.', ') has a low threshold and pulls loud sounds down hard. Change it in the mixer settings.'],
    ['Rozłączono Bluetooth.', 'Bluetooth disconnected.'],
    ['Ta przeglądarka nie obsługuje MIDI. Użyj Chrome na Androidzie lub komputerze.', 'This browser has no MIDI. Use Chrome on Android or a computer.'],
    ['Brak zgody na MIDI. Zezwól w ustawieniach strony i spróbuj ponownie.', 'No MIDI permission. Allow it in the site settings and try again.'],
    ['Połączono z ', 'Connected to '], ['. Wysłano ustawienia.', '. Settings sent.'], ['Połączenie z mikserem', 'Mixer connection'],
    ['FLOW 8 · Bluetooth (1 strona)', 'FLOW 8 · Bluetooth (one way)'], ['Łączę przez Bluetooth…', 'Connecting over Bluetooth…'],
    ['łączę przez Bluetooth…', 'connecting over Bluetooth…'],
    ['FLOW 8 · kabel USB', 'FLOW 8 · USB cable'], ['Nie widzę FLOW 8, podłącz USB', 'No FLOW 8 found, connect USB'],
    ['Błąd wysyłania, podłącz ponownie', 'Send error, reconnect'], ['Tryb demo, podłącz mikser USB', 'Demo mode, connect the mixer by USB'],
    ['Najpierw połącz się z mikserem.', 'Connect to the mixer first.'], ['Wczytano scenę ', 'Loaded scene '], [' w mikserze', ' in the mixer'],
    ['Włącz Bluetooth w telefonie', 'Turn on Bluetooth on the phone'], ['Nie znaleziono FLOW 8. Czy mikser jest włączony, a FLOW Mix zamknięta?', 'FLOW 8 not found. Is the mixer on and FLOW Mix closed?'],
    ['Wysłano ustawienia do miksera przez Bluetooth', 'Settings sent to the mixer over Bluetooth'], ['Wysłano wszystkie ustawienia do miksera', 'All settings sent to the mixer'],
    // ----- channel page, EQ, FX -----
    ['Ustawienia kanału', 'Channel settings'], ['Wróć', 'Back'], [': ustawienia zaawansowane', ': advanced settings'],
    ['poziomy', 'levels'], ['korektor', 'EQ'], ['niskie', 'low'], ['niski środek', 'low mid'], ['wysoki środek', 'high mid'], ['wysokie', 'high'],
    ['filtr i kompresor', 'low cut and compressor'], ['odcięcie basu', 'low cut'], ['Odcięcie basu (Hz)', 'Low cut (Hz)'], ['kompresor', 'compressor'],
    ['Kompresor (%)', 'Compressor (%)'], ['Od 20 do 600 Hz.', 'From 20 to 600 Hz.'], ['Od 0 do 100.', 'From 0 to 100.'],
    ['Od -15 do +15, co 0,5 dB.', 'From -15 to +15, in 0.5 dB steps.'], ['Włączyć zasilanie phantom 48 V na kanale ', 'Turn on 48 V phantom power on channel '],
    ['? Ścisz najpierw kanał.', '? Turn the channel down first.'], ['odwróć fazę', 'invert phase'], ['blokada', 'lock'], ['presety', 'presets'],
    ['Kanał zablokowany: suwak, gain, pan, mute i solo nie reagują.', 'Channel locked: fader, gain, pan, mute and solo do not respond.'],
    ['Kanał odblokowany', 'Channel unlocked'], [' jest zablokowany. Odblokujesz go na stronie kanału.', ' is locked. Unlock it on the channel page.'],
    ['kolor suwaka', 'fader colour'], ['kolor gałki', 'knob colour'], ['własny', 'custom'], ['barwa', 'hue'], ['nasycenie', 'saturation'], ['jasność', 'lightness'],
    ['Kolor ', 'Colour '], ['kolor', 'colour'], ['Zmień znak', 'Change sign'], ['Anuluj', 'Cancel'],
    ['Poziom ', 'Level '], ['Od -70 do +10, co 0,5 dB. Puste pole = wyciszony do zera.', 'From -70 to +10, in 0.5 dB steps. Empty = off.'],
    ['Gain ', 'Gain '], ['Od -20 do +60, co 0,5 dB.', 'From -20 to +60, in 0.5 dB steps.'], ['Panorama ', 'Pan '],
    ['L1 do L50, C, R1 do R50. Sam minus też znaczy lewo.', 'L1 to L50, C, R1 to R50. A minus alone also means left.'], ['Nazwa kanału', 'Channel name'],
    ['Pasmo ', 'Band '], ['pasmo ', 'band '], ['częstotliwość', 'frequency'], ['Częstotliwość pasma ', 'Frequency of band '],
    ['Od 20 do 20000 Hz.', 'From 20 to 20000 Hz.'], ['Wzmocnienie pasma ', 'Gain of band '], ['wzmocnienie', 'gain'], ['szerokość (Q)', 'width (Q)'],
    ['Szerokość pasma ', 'Width of band '], ['Od 0,3 (szeroko) do 10,3 (wąsko).', 'From 0.3 (wide) to 10.3 (narrow).'], ['wyzeruj korektor', 'reset EQ'],
    ['efekty', 'effects'], ['wysyłka kanału', 'channel send'], ['powrót efektu', 'effect return'], [' (0 do 100)', ' (0 to 100)'],
    ['Tap tempo', 'Tap tempo'], ['Stuknij jeszcze raz w rytm', 'Tap once more in time'], ['Tempo efektów: ', 'Effect tempo: '],
    // ----- mixer settings -----
    ['ustawienia', 'settings'], ['mikser', 'mixer'], ['aplikacja', 'app'], ['wyjścia mon', 'monitor outputs'], ['wyjścia', 'outputs'],
    ['Limiter ', 'Limiter '], ['Od -30 do 0, co 0,5 dB.', 'From -30 to 0, in 0.5 dB steps.'],
    ['Uwaga: niski próg limitera (', 'Note: low limiter threshold ('], [') mocno ścisza głośne dźwięki. Zwykle ustawia się go blisko 0 dB.', ') pulls loud sounds down hard. It is usually set close to 0 dB.'],
    ['wyjście sala', 'main output'], ['opóźnienie: sala ', 'delay: main '], ['odsłuchy i słuchawki', 'monitors and headphones'], ['mon 1 i 2', 'mon 1 and 2'],
    ['para stereo', 'stereo pair'], ['osobno', 'separate'], ['słuchawki z', 'headphones from'], ['tylko słuchawki', 'headphones only'], ['słuchawki', 'headphones'],
    ['monitory', 'monitors'], ['monitora', 'monitor'], ['usb i bluetooth', 'USB and Bluetooth'], ['tryb usb', 'USB mode'], ['nagrywanie', 'recording'],
    ['kanał 5/6', 'channel 5/6'], ['kanał 7/8', 'channel 7/8'], ['wejście', 'input'], ['bt/usb gra', 'BT/USB plays'], ['do miksu', 'into the mix'],
    [' gra na', ' plays on'], ['Tempo efektów (bpm)', 'Effect tempo (bpm)'], ['Od 40 do 240.', 'From 40 to 240.'], ['przełącznik nożny', 'foot switch'], ['sceny', 'scenes'],
    // ----- scenes -----
    ['pamięć miksera', 'mixer memory'], ['wczytaj', 'load'], ['zapisz', 'save'], ['nazwa', 'name'], ['usuń', 'delete'], ['pusta', 'empty'],
    ['Nadpisać scenę ', 'Overwrite scene '], ['” obecnymi ustawieniami?', '” with the current settings?'], ['Nazwa sceny', 'Scene name'], ['Scena ', 'Scene '],
    ['Zapisano scenę ', 'Saved scene '], ['Nowa nazwa sceny', 'New scene name'], ['Usunąć scenę ', 'Delete scene '], ['” z miksera?', '” from the mixer?'],
    // ----- app settings -----
    ['wygląd', 'look'], ['motyw', 'theme'], ['jasny', 'light'], ['ciemny', 'dark'], ['język', 'language'], ['dźwięki', 'sounds'],
    ['dźwięk suwaka', 'fader sound'], ['dźwięk gałki', 'knob sound'], ['cisza', 'silent'], ['Od 0 (cisza) do 200.', 'From 0 (silent) to 200.'],
    ['wibracja', 'vibration'], ['gałka gain', 'gain knob'], ['suwak i pan', 'fader and pan'], ['włączona', 'on'], ['wyłączona', 'off'],
    ['zatrzask na 0 dB', '0 dB detent'], ['Zatrzask: ', 'Detent: '], ['0 = brak, 100 = stop na 0 dB.', '0 = none, 100 = stops at 0 dB.'],
    ['Im dalej w prawo, tym mocniej 0 dB trzyma. Na końcu skali suwak staje na 0 dB i trzeba puścić palec, żeby pojechać dalej.', 'The further right, the harder 0 dB holds. At the end the fader stops at 0 dB and you lift your finger to go on.'],
    ['opór przy przesuwaniu', 'drag resistance'], ['Opór: ', 'Resistance: '], ['0 = brak, 100 = najcięższy.', '0 = none, 100 = heaviest.'],
    ['Większy opór oznacza, że palec musi przejechać dłuższą drogę (do 4 razy), więc łatwiej ustawić dokładną wartość.', 'More resistance means a longer finger travel (up to 4 times), so exact values are easier to set.'],
    ['suwak', 'fader'], ['brak', 'none'],
    // ----- measuring -----
    ['Pomiar: spadek na ', 'Measure: drop on '], [' dB). Szczegóły w Pomiarze.', ' dB). Details in Measure.'], ['W tym czasie wyciszono kanał: ', 'At that moment a channel was muted: '],
    ['Spadło już na wejściu (', 'It dropped already at the input ('], ['). Mikser dostał cichszy sygnał: sprawdź źródło, kabel, nadajnik albo zasilanie.', '). The mixer got a quieter signal: check the source, cable, transmitter or power.'],
    ['Spadło na wejściu: ', 'Dropped at the input: '], ['. Reszta wejść grała równo. Sprawdź źródło tych kanałów, kabel albo nadajnik.', '. The other inputs stayed steady. Check the source of these channels, the cable or the transmitter.'],
    ['Wejścia grały równo, a limiter wyjścia ściszał (próg ', 'Inputs were steady and the output limiter was pulling down (threshold '], [' dB). Podnieś próg limitera.', ' dB). Raise the limiter threshold.'],
    ['Wejścia grały równo, pracował kompresor kanału: ', 'Inputs were steady, a channel compressor was working: '], ['. Zmniejsz kompresję.', '. Use less compression.'],
    ['Wejścia grały równo, limiter i kompresory nie pracowały. Spadek powstał w mikserze za wejściami, czyli na sumie albo na samym wyjściu.', 'Inputs were steady, limiter and compressors idle. The drop happened inside the mixer after the inputs, on the mix bus or the output.'],
    [': spadek o ', ': drop of '], ['ostatnia minuta', 'last minute'], ['odsłuchy', 'monitors'], ['wejścia', 'inputs'], ['wykryte spadki', 'detected drops'],
    ['wyczyść', 'clear'], ['kopiuj raport', 'copy report'], ['Raport skopiowany. Wklej go tutaj w rozmowie.', 'Report copied. Paste it into the chat.'],
    ['Na razie nic. Graj normalnie, a gdy dźwięk siądzie, spadek pojawi się tutaj z opisem, co go spowodowało.', 'Nothing yet. Play as usual; when the sound dips, the drop shows up here with its likely cause.'],
    ['Połącz się z mikserem przez Bluetooth, żeby mierzyć.', 'Connect to the mixer over Bluetooth to measure.'], ['Czekam na wskaźniki z miksera…', 'Waiting for meters from the mixer…'],
    ['Mierzę. Zapisane ', 'Measuring. Stored '], [' odczytów.', ' readings.'], [' Mikser nie podaje poziomów odsłuchów, widać tylko salę.', ' The mixer does not report monitor levels, only main is shown.'],
    ['teraz', 'now'], ['pomiar', 'measure'],
    // ----- diagnostics, update -----
    ['Sprawdzam najnowszą wersję…', 'Checking for the newest version…'], ['Masz v', 'You have v'], [', jest nowsza: v', ', a newer one is out: v'],
    ['Masz najnowszą wersję (v', 'You have the newest version (v'], ['. Nie udało się sprawdzić (brak internetu?)', '. Could not check (no internet?)'],
    ['Pobieram nową wersję. Po pobraniu dotknij pliku i wybierz Zainstaluj.', 'Downloading the new version. Tap the file when done and choose Install.'],
    ['Diagnostyka', 'Diagnostics'], ['Aktualizuj', 'Update'], ['Badaj mikser', 'Probe mixer'], ['Kopiuj', 'Copy'], ['Zamknij', 'Close'],
    ['Pytam mikser o stan kanałów…', 'Asking the mixer for the channel state…'], ['Skopiowano. Wklej to w czacie.', 'Copied. Paste it into the chat.'],
    ['Zaznaczyłem tekst: przytrzymaj i wybierz Kopiuj.', 'Text selected: hold it and choose Copy.'],
    // ----- presets -----
    ['wokal (mikrofon dynamiczny)', 'vocal (dynamic mic)'], ['wokal (pojemnościowy)', 'vocal (condenser)'], ['gitara akustyczna', 'acoustic guitar'],
    ['gitara elektryczna', 'electric guitar'], ['gitara basowa', 'bass guitar'], ['stopa', 'kick'], ['werbel', 'snare'], ['klawisze', 'keys'],
    ['płasko (wszystko na zero)', 'flat (all at zero)'], ['” na kanale ', '” on channel '], [' (wyślę po połączeniu: menu, Wyślij wszystko)', ' (sent after you connect: menu, Send to mixer)'],
    ['filtr ', 'low cut '], ['wył.', 'off'], ['komp. ', 'comp. '], ['To nie jest plik z presetami.', 'This is not a preset file.'],
    ['Wczytano presety: ', 'Presets loaded: '], ['Nie znalazłem presetów w tym pliku.', 'No presets found in this file.'], ['kanały', 'channels'], ['kanał', 'channel'],
    ['wczytuj', 'load'], ['filtr', 'low cut'], ['moje presety', 'my presets'], ['zapisz ustawienia kanału jako nowy preset', 'save channel settings as a new preset'],
    ['Nazwa presetu', 'Preset name'], ['Preset „', 'Preset “'], ['” już jest. Nadpisać?', '” already exists. Overwrite?'], ['Zapisano preset „', 'Saved preset “'],
    ['Jeszcze nic. Ustaw kanał i zapisz go jako preset.', 'Nothing yet. Set up a channel and save it as a preset.'], ['Zapisać w „', 'Store in “'],
    ['” obecne ustawienia kanału ', '” the current settings of channel '], ['Usunąć preset „', 'Delete preset “'], ['Nowa nazwa presetu', 'New preset name'],
    ['Przytrzymaj nazwę presetu, żeby ją zmienić.', 'Hold a preset name to rename it.'], ['gotowe na początek', 'starting points'], ['do moich', 'to mine'],
    ['Nazwa w moich presetach', 'Name in my presets'], ['nadpisz', 'overwrite'], ['kopia zapasowa', 'backup'], ['wyślij / zapisz', 'send / save'],
    ['pobierz plik', 'download file'], ['kopiuj tekst', 'copy text'], ['Presety skopiowane do schowka', 'Presets copied to the clipboard'],
    ['Schowek niedostępny', 'Clipboard not available'], ['wczytaj z pliku', 'load from file'], ['wklej', 'paste'],
    ['Wklej tutaj tekst kopii presetów', 'Paste the preset backup text here'], ['dodaj z wklejonego tekstu', 'add from the pasted text'],
    ['Kopia to plik tekstowy z Twoimi presetami. Wyślij go sobie (Dysk, e-mail, komunikator). Wczytanie dodaje presety, a te o tej samej nazwie zastępuje.', 'The backup is a text file with your presets. Send it to yourself (Drive, e-mail, messenger). Loading adds presets and replaces those with the same name.'],
    ['Nie udało się. Użyj „kopiuj”.', 'That failed. Use “copy text”.'], ['Nie udało się. Użyj „kopiuj tekst”.', 'That failed. Use “copy text”.'],
    // ----- setlist -----
    ['Setlista 1', 'Setlist 1'], ['Setlista ', 'Setlist '], ['setlista', 'setlist'], ['setlisty', 'setlists'], ['piosenki', 'songs'], ['piosenka', 'song'],
    ['scena ', 'scene '], ['Setlista jest pusta.', 'The setlist is empty.'], ['To ostatnia piosenka.', 'This is the last song.'], ['To pierwsza piosenka.', 'This is the first song.'],
    ['klawisz ', 'key '], ['nuta ', 'note '], ['program ', 'program '], [' (kanał ', ' (channel '], ['Przypisano: ', 'Assigned: '], ['Brak piosenki nr ', 'No song number '],
    ['◀ poprzednia', '◀ previous'], ['następna ▶', 'next ▶'], ['dodaj piosenkę z obecnych ustawień', 'add a song from the current settings'], ['Nazwa piosenki', 'Song name'],
    ['Piosenka zapamiętuje tempo metronomu, oba efekty (program, parametry, wysyłki) i opcjonalnie scenę miksera. Stuknij nazwę, żeby ją zagrać.', 'A song stores the metronome tempo, both effects (program, parameters, sends) and optionally a mixer scene. Tap a name to play it.'],
    ['nic nie wybrano', 'nothing selected'], ['Stuknij piosenkę na liście albo „następna”.', 'Tap a song in the list or “next”.'],
    ['Pusta setlista. Ustaw tempo i efekty, potem „dodaj piosenkę”.', 'Empty setlist. Set tempo and effects, then “add a song”.'], ['edytuj', 'edit'],
    ['Nazwa setlisty', 'Setlist name'], ['nowa', 'new'], ['zmień nazwę', 'rename'], ['Nowa nazwa setlisty', 'New setlist name'], ['kopia setlisty', 'copy setlist'],
    [' (kopia)', ' (copy)'], ['Usunąć setlistę „', 'Delete setlist “'], [' piosenek)?', ' songs)?'], ['sterowanie', 'control'], ['Kontrolery MIDI: ', 'MIDI controllers: '],
    ['Nie widzę kontrolera MIDI. Kablowy podłącz przez przejściówkę USB OTG, bezprzewodowy znajdź niżej.', 'No MIDI controller found. Connect a wired one with a USB OTG adapter, find a wireless one below.'],
    ['W przeglądarce kontroler MIDI zadziała po połączeniu przez kabel USB (menu pod lampką).', 'In the browser a MIDI controller works after connecting by USB cable (menu under the lamp).'],
    ['Naciśnij przycisk na kontrolerze albo pedale', 'Press a button on the controller or pedal'], ['czekam…', 'waiting…'], ['naucz', 'learn'],
    ['następna', 'next'], ['poprzednia', 'previous'], ['zmiana programu', 'program change'], ['wybiera piosenkę', 'picks the song'], ['nic', 'nothing'],
    ['pedał do stron', 'page-turner pedal'], ['działa', 'on'], ['wyłączony', 'off'],
    ['Zmiana programu 1 wybiera piosenkę 1, program 2 piosenkę 2 i tak dalej. Pedał do przewracania stron (albo klawiatura Bluetooth): strzałka w prawo, w dół, PageDown i spacja to następna, strzałka w lewo, w górę i PageUp to poprzednia. Działa też przy zablokowanym ekranie.', 'Program change 1 picks song 1, program 2 song 2 and so on. Page-turner pedal (or a Bluetooth keyboard): right arrow, down arrow, PageDown and space go to the next song, left arrow, up arrow and PageUp to the previous one. Works with the screen locked too.'],
    ['szukaj kontrolera Bluetooth MIDI', 'search for a Bluetooth MIDI controller'], ['Nie mogę szukać', 'Cannot search'], ['szukam… (włącz kontroler)', 'searching… (turn the controller on)'],
    ['połącz: ', 'connect: '], ['Łączę z ', 'Connecting to '], ['Nie udało się', 'That failed'], ['Zapamiętany kontroler Bluetooth łączy się sam po starcie aplikacji.', 'The remembered Bluetooth controller connects by itself when the app starts.'],
    ['Setlisty skopiowane do schowka', 'Setlists copied to the clipboard'], ['To nie jest plik z setlistami.', 'This is not a setlist file.'], ['Wczytano setlisty: ', 'Setlists loaded: '],
    ['Nie znalazłem setlist w tym pliku.', 'No setlists found in this file.'], ['Wklej tutaj tekst kopii setlist', 'Paste the setlist backup text here'],
    ['Kopia zawiera wszystkie setlisty. Wczytanie dodaje setlisty, a te o tej samej nazwie zastępuje.', 'The backup holds all setlists. Loading adds setlists and replaces those with the same name.'],
    ['nazwa i notatki', 'name and notes'], ['Notatki widoczne przy piosence: tonacja, kapodaster, kto zaczyna…', 'Notes shown with the song: key, capo, who starts…'],
    ['Tempo (bpm)', 'Tempo (bpm)'], ['tempo efektu', 'effect tempo'], ['wysyłaj', 'send'], ['efekty i scena', 'effects and scene'], ['metrum', 'time signature'],
    ['%), FX 2: ', '%), FX 2: '], ['Efekty bez zmian przy tej piosence.', 'Effects stay as they are for this song.'], ['weź obecne efekty', 'take current effects'],
    ['Zapisano obecne efekty w piosence', 'Current effects stored in the song'], ['bez efektów', 'no effects'], ['weź obecne tempo', 'take current tempo'],
    ['scena miksera', 'mixer scene'], ['Scena miksera (0 = bez zmiany sceny)', 'Mixer scene (0 = keep the scene)'], ['Od 1 do 15 albo 0, żeby nie zmieniać sceny.', 'From 1 to 15, or 0 to keep the scene.'],
    ['bez zmiany', 'no change'], ['Scena wczytuje się pierwsza, a efekty i tempo piosenki trafiają do miksera zaraz po niej.', 'The scene loads first, the song effects and tempo go to the mixer right after it.'],
    ['kolejność', 'order'], ['wyżej', 'up'], ['niżej', 'down'], ['zagraj teraz', 'play now'], ['usuń piosenkę', 'delete song'], ['Usunąć „', 'Delete “'], ['” z setlisty?', '” from the setlist?'],
    // ----- metronome -----
    ['wyjście', 'output'], ['dźwięk', 'sound'], ['głośność', 'volume'], ['Głośność metronomu', 'Metronome volume'], ['lewe', 'left'], ['prawe', 'right'],
    ['drewno', 'wood'], ['tak', 'yes'], ['nie', 'no'],
    // ----- MIDI native -----
    ['MIDI wymaga Androida 6', 'MIDI needs Android 6'], ['Nie mogę połączyć: ', 'Cannot connect: '], ['Nie mogę udostępnić', 'Cannot share'],
    // ----- recorder (v0.69) -----
    ['Rekorder', 'Recorder'], ['rekorder', 'recorder'], ['odtwarzacz', 'player'], ['karta USB', 'USB card'], ['sprawdź', 'check'], ['test 10 s', '10 s test'],
    ['nagrywanie', 'recording'], ['nagrania', 'recordings'], ['nazwa nagrania', 'recording name'], ['data i godzina', 'date and time'], ['Nagrywaj', 'Record'], ['Zatrzymaj nagrywanie', 'Stop recording'],
    ['Podczas nagrywania ekran zostaje włączony. Nie zamykaj aplikacji, sterowanie mikserem działa normalnie.', 'While recording the screen stays on. Keep the app open, mixer control works as usual.'],
    ['Jeszcze nic nie nagrano.', 'Nothing recorded yet.'], ['nagranie bez nazwy', 'untitled recording'], ['Sprawdzam kartę USB…', 'Checking the USB card…'],
    ['Nie widzę karty dźwiękowej USB. Podłącz FLOW 8 kablem USB do telefonu (przejściówka USB OTG, jeśli trzeba) i w Ustawieniach miksera wybierz tryb USB „nagrywanie”.', 'No USB sound card found. Connect the FLOW 8 to the phone with a USB cable (USB OTG adapter if needed) and set USB mode to “recording” in the mixer settings.'],
    ['Karta USB: ', 'USB card: '], ['. Android zgłasza do ', '. Android reports up to '], [' kanałów, próbkowanie ', ' channels, sample rate '], ['dowolne', 'any'],
    ['nagrywam ', 'recording '], ['gotowy, ', 'ready, '], ['brak karty USB', 'no USB card'], [' śladów', ' tracks'], ['śladów', 'tracks'],
    ['Wolne miejsce: ', 'Free space: '], [', starczy na około ', ', enough for about '], [' nagrania ', ' of recording, '],
    ['Nazwa nagrania (pusta = nazwa piosenki z setlisty)', 'Recording name (empty = song name from the setlist)'], ['Nazwa nagrania', 'Recording name'],
    ['Nagranie zapisane: ', 'Recording saved: '], ['Test zapisany: ', 'Test saved: '], [' Zabrakło miejsca w telefonie.', ' The phone ran out of space.'],
    ['Rekorder działa w aplikacji na Androidzie (APK). Dźwięk idzie kablem USB z miksera do telefonu, każdy kanał na osobny ślad.', 'The recorder works in the Android app (APK). Sound goes from the mixer to the phone over USB, each channel to its own track.'],
    ['odtwarzanie', 'playback'], ['Pozycja', 'Position'], ['Na początek', 'To start'], ['Pauza', 'Pause'], ['Graj', 'Play'], ['pętla od', 'loop from'], ['pętla do', 'loop to'], ['bez pętli', 'no loop'],
    ['słuchaj przez', 'listen on'], ['telefon', 'phone'], ['mikser USB', 'mixer USB'],
    ['„mikser USB” wysyła miks z powrotem do FLOW 8 (USB 1/2). Żeby go usłyszeć, ustaw w Ustawieniach miksera kanał 5/6 na USB.', '“mixer USB” sends the mix back to the FLOW 8 (USB 1/2). To hear it, set channel 5/6 to USB in the mixer settings.'],
    ['ślady', 'tracks'], ['Głośność', 'Volume'], ['Balans', 'Balance'], ['Panorama', 'Pan'], ['Nazwa śladu', 'Track name'], ['Głośność w dB (od -60 do +10)', 'Volume in dB (-60 to +10)'],
    ['rozdziel pary stereo', 'split stereo pairs'], ['połącz pary stereo', 'join stereo pairs'], ['wyzeruj miks', 'reset mix'],
    ['Ustawić wszystkie ślady na 0 dB, środek, bez mute i solo?', 'Set all tracks to 0 dB, centre, no mute or solo?'],
    ['Przytrzymaj nazwę śladu, żeby ją zmienić. Stuknij wartość dB, żeby ją wpisać. Miks zapisuje się przy nagraniu.', 'Hold a track name to rename it. Tap the dB value to type it. The mix is saved with the recording.'],
    ['eksport', 'export'], ['zrób miks stereo (WAV)', 'make stereo mix (WAV)'], ['wyślij miks', 'send mix'], ['wyślij ślady', 'send tracks'], ['zapisz w Muzyce', 'save to Music'],
    ['Nazwa pliku miksu', 'Mix file name'], ['Gotowy plik: ', 'Ready file: '], ['Zrobione miksy: ', 'Mixes made: '],
    ['Miks stereo powstaje z obecnych ustawień śladów, bez przerywania odtwarzania.', 'The stereo mix is made from the current track settings, playback keeps going.'],
    ['nagranie', 'recording'], ['zmień nazwę', 'rename'], ['usuń nagranie', 'delete recording'], ['Usunąć to nagranie ze wszystkimi śladami? Tego nie da się cofnąć.', 'Delete this recording with all its tracks? This cannot be undone.'],
    ['Usunięto.', 'Deleted.'], ['Miks gotowy: ', 'Mix ready: '], [' (uwaga: przester, ścisz master)', ' (warning: clipping, lower the master)'], ['Najpierw zatrzymaj nagrywanie.', 'Stop recording first.'],
    ['Raport skopiowany. Wklej go tutaj w rozmowie.', 'Report copied. Paste it here in the chat.'], ['kopiuj raport', 'copy report']
  ];
  const exact = new Map(D.map(([a, b]) => [a, b]));
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const L = '\\p{L}';
  // longest pieces first, matched only as whole words where they begin or end with a letter
  const parts = D.slice().sort((a, b) => b[0].length - a[0].length).map(([a, b]) => [new RegExp((/^\p{L}/u.test(a) ? '(?<!' + '[' + L + '])' : '') + esc(a) + (/\p{L}$/u.test(a) ? '(?![' + L + '])' : ''), 'gu'), b]);
  const cache = new Map();
  function tr(t) {
    if (typeof t !== 'string' || !t || window.LANG !== 'en' || !/\p{L}/u.test(t)) return t;
    if (cache.has(t)) return cache.get(t);
    const k = t.trim();
    let out;
    if (exact.has(k)) out = t.replace(k, exact.get(k));
    else {
      // swap each known piece once, using placeholders so an English word is never translated again
      const found = []; out = t;
      for (const [re, en] of parts) out = out.replace(re, () => { found.push(en); return '\u0001' + (found.length - 1) + '\u0002'; });
      out = out.replace(/\u0001(\d+)\u0002/g, (m, n) => found[+n]);
    }
    cache.set(t, out); cache.set(out, out);
    return out;
  }
  window.tr = tr;
  const ATTRS = ['aria-label', 'title', 'placeholder'];
  const skip = n => { for (let e = n.nodeType === 1 ? n : n.parentElement; e; e = e.parentElement) { if (e.hasAttribute && e.hasAttribute('data-notr')) return true; if (e.tagName === 'TEXTAREA' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') return true; } return false; };
  function walk(root) {
    if (root.nodeType === 3) { if (!skip(root)) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
    if (root.nodeType !== 1 || skip(root)) return;
    ATTRS.forEach(a => { const v = root.getAttribute(a); if (v) { const t = tr(v); if (t !== v) root.setAttribute(a, t); } });
    for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
  }
  window.trStart = function () {
    if (window.LANG !== 'en') return;
    document.documentElement.lang = 'en';
    walk(document.body);
    new MutationObserver(list => list.forEach(m => {
      if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') walk(m.target);
      else m.addedNodes.forEach(walk);
    })).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
})();
