const lastArg = args[args.length - 1];

// macro vars
const sequencerFile = "jb2a.markers.fear.dark_purple.01";
const sequencerScale = 1.5;
const damageType = "psychic";

// sequencer caller for effects on target
function sequencerEffect(target, file, scale) {
  if (game.modules.get("sequencer")?.active && hasProperty(Sequencer.Database.entries, "jb2a")) {
    new Sequence().effect().file(file).atLocation(target).scaleToObject(scale).play();
  }
}

function weaponAttack(caster, sourceItemData, origin, target) {
  const chosenWeapon = DAE.getFlag(caster, "tauntingBladeChoice");
  const filteredWeapons = caster.items.filter((i) => i.type === "weapon" && i.system.equipped);
  const weaponContent = filteredWeapons
    .map((w) => {
      const selected = chosenWeapon && chosenWeapon == w.id ? " selected" : "";
      return `<option value="${w.id}"${selected}>${w.name}</option>`;
    })
    .join("");

  const content = `
<div class="form-group">
 <label>Weapons : </label>
 <select name="weapons"}>
 ${weaponContent}
 </select>
</div>
`;
  new Dialog({
    title: "Taunting Blade: Choose a weapon to attack with",
    content,
    buttons: {
      Ok: {
        label: "Ok",
        callback: async (html) => {
          const characterLevel = caster.type === "character" ? caster.system.details.level : caster.system.details.cr;
          const cantripDice = 1 + Math.floor((characterLevel + 1) / 6);
          const itemId = html.find("[name=weapons]")[0].value;
          const weaponItem = caster.getEmbeddedDocument("Item", itemId);
          DAE.setFlag(caster, "tauntingBladeChoice", itemId);
          const weaponCopy = duplicate(weaponItem);
          delete weaponCopy._id;
          if (cantripDice > 0) {
            weaponCopy.system.damage.parts[0][0] += ` + ${cantripDice - 1}d6[${damageType}]`;
          }
          weaponCopy.name = weaponItem.name + " [Taunting Blade]";
          weaponCopy.effects.push({
            changes: [{ key: "macro.itemMacro", mode: 0, value: "", priority: "20", }],
            disabled: false,
            duration: { rounds: 1 },
            icon: sourceItemData.img,
            label: sourceItemData.name,
            origin,
            transfer: false,
            flags: { targetUuid: target.uuid, casterUuid: caster.uuid, origin, cantripDice, damageType, dae: { transfer: false } },
          });
          setProperty(weaponCopy, "flags.itemacro", duplicate(sourceItemData.flags.itemacro));
          setProperty(weaponCopy, "flags.midi-qol.effectActivation", false);
          const attackItem = new CONFIG.Item.documentClass(weaponCopy, { parent: caster });
          const options = { showFullCard: false, createWorkflow: true, configureDialog: true };
          await MidiQOL.completeItemRoll(attackItem, options);
        },
      },
      Cancel: {
        label: "Cancel",
      },
    },
  }).render(true);
}

if (args[0].tag === "OnUse") {
  if (lastArg.targets.length > 0) {
    const casterData = await fromUuid(lastArg.actorUuid);
    const caster = casterData.actor ? casterData.actor : casterData;
    weaponAttack(caster, lastArg.itemData, lastArg.uuid, lastArg.targets[0]);
  } else {
    ui.notifications.error("Taunting Blade: No target selected: please select a target and try again.");
  }

} else if (args[0] === "on") {
  const targetToken = canvas.tokens.get(lastArg.tokenId);
  sequencerEffect(targetToken, sequencerFile, sequencerScale);
  if (lastArg.efData.flags.cantripDice) {
    hook = Hooks.on("midi-qol.AttackRollComplete", async (workflow) => {
      if(workflow.tokenUuid == lastArg.tokenUuid){
        if(workflow.hitTargets.size < workflow.targets.size){
          const targetToken = await fromUuid(lastArg.tokenUuid);
          const sourceItem = await fromUuid(lastArg.efData.flags.origin);
          const caster = sourceItem.parent;
          const casterToken = canvas.tokens.placeables.find((t) => t.actor?.uuid === caster.uuid);
          const damageRoll = await new Roll(`${lastArg.efData.flags.cantripDice}d6[${damageType}]`).evaluate({ async: true });
          if (game.dice3d) game.dice3d.showForRoll(damageRoll);
          const workflowItemData = duplicate(sourceItem.data);
          workflowItemData.system.target = { value: 1, units: "", type: "creature" };
          workflowItemData.name = "Taunting Blade: Failed Attack Roll Damage";

          await new MidiQOL.DamageOnlyWorkflow(
            caster,
            casterToken,
            damageRoll.total,
            damageType,
            [targetToken.object], // bug in midi/levels auto cover can't cope with token
            damageRoll,
            {
              flavor: `(${CONFIG.DND5E.damageTypes[damageType]})`,
              itemCardId: "new",
              itemData: workflowItemData,
              isCritical: false,
            }
          );
          sequencerEffect(targetToken, sequencerFile, sequencerScale);
          return MidiQOL.socket().executeAsGM('removeEffects', {'actorUuid': lastArg.actorUuid, 'effects': [lastArg.effectId]});
        }
      }

    });
    DAE.setFlag(await fromUuid(lastArg.actorUuid), "tauntingBladeHook", hook);
  }
} else if (args[0] === "off") {
  actor = await fromUuid(lastArg.actorUuid)
  hook = DAE.getFlag(actor, "tauntingBladeHook");
  Hooks.off("midi-qol.AttackRollComplete", hook);
  DAE.unsetFlag(actor, "tauntingBladeHook");
}
