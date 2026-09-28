#!/bin/bash
set -e
RB=/home/user/ext/rocketbox
OUT=/home/user/crop/konbini-sim/public/assets
PY=/home/user/ext/bvenv/bin/python
AV="Adults/Male_Adult_01 Adults/Male_Adult_03 Adults/Male_Adult_05 Adults/Male_Adult_08 Adults/Male_Adult_11 Adults/Male_Adult_14 Adults/Male_Adult_17 Adults/Male_Adult_20 Adults/Female_Adult_01 Adults/Female_Adult_03 Adults/Female_Adult_05 Adults/Female_Adult_08 Adults/Female_Adult_12 Adults/Female_Adult_15 Adults/Female_Party_01 Professions/Business_Male_01 Professions/Business_Male_04 Professions/Business_Female_02 Professions/Construction_Male_02 Professions/Delivery_Male_01 Professions/Police_Male_01 Adults/Male_Adult_16 Adults/Male_Adult_09 Adults/Female_Adult_13 Adults/Female_Adult_17 Professions/Business_Male_06"
CLIPS="idle:idle_neutral_01 walk:walk_neutral_01 walk_slow:walk_slow_01 walk_drunk:walk_drunk idle_drunk:idle_drunk_01 angry:idle_angry_01 talk_angry:gestic_talk_angry_01 talk:gestic_talk_neutral_01 look:idle_look_around_01 wait:idle_waiting_01 phone:cell_phone_textmessage read:newspaper_hand_idle run:run_fast_01 take:documents_take crouch:crouch_idle shrug:gestic_shrug_01 wave:wave_01 yawn:idle_yawn_01 deny:gestic_listen_deny_01 scratch:idle_scratch_head_01"
cd $RB
{
  echo /LICENSE.md
  for a in $AV; do echo "/Assets/Avatars/$a/Export/$(basename $a).fbx"; echo "/Assets/Avatars/$a/Textures/"; done
  for g in m f; do for c in $CLIPS; do f=${c#*:}; grep -E "/${g}_${f}\.max\.fbx$" ../rb_files.txt | head -1 | sed 's#^#/#'; done; done
} > .git/info/sparse-checkout
git checkout -q 2>&1 | tail -1
mkdir -p $OUT/characters $OUT/anims
for a in $AV; do
  n=$(basename $a)
  [ -f $OUT/characters/$n.glb ] && continue
  (cd Assets/Avatars/$a && $PY /home/user/ext/scripts/rb_avatar.py -- Export/$n.fbx Textures $OUT/characters/$n.glb 1024 2>&1 | grep -E "WROTE|Error" )
done
for g in m f; do
  args=""
  for c in $CLIPS; do nm=${c%%:*}; f=${c#*:}; p=$(grep -E "/${g}_${f}\.max\.fbx$" ../rb_files.txt | head -1); args="$args $nm=$RB/$p"; done
  $PY /home/user/ext/scripts/rb_anims.py -- $OUT/anims/anims_$g.glb $args 2>&1 | grep -E "WROTE|Error|Trace"
done
cp LICENSE.md $OUT/characters/LICENSE-Rocketbox.md
