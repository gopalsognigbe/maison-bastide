Hero balayage SFX:

  beans-paddle.wav     ← used on site (trim 0–1.511 s from source)
  634120__erbsland-music__coffee-beans-rustling-stirring.wav  ← source (Freesound CC0)

Regenerate trim:
  ffmpeg -i 634120__erbsland-music__coffee-beans-rustling-stirring.wav -t 1.511 -ac 1 -ar 44100 beans-paddle.wav

Plays on each title burst (balayages 1–4) in the hero.
