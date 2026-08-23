package com.nakao.cropsneakgrowth;

import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.block.Block;
import org.bukkit.block.data.Ageable;
import org.bukkit.block.data.BlockData;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerToggleSneakEvent;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * プレイヤーが作物の隣でしゃがみ(トグルON)を繰り返すと、
 * 一定回数ごとに作物の成長段階を1つ進める。
 */
public class SneakGrowListener implements Listener {

    private final Plugin plugin;
    private CropGrowthSettings settings;

    // 作物1ブロックごとの累積しゃがみ回数
    private final Map<Location, Integer> sneakCounts = new ConcurrentHashMap<>();
    // 作物1ブロックごとの最終カウント時刻(連打・マクロ対策のクールダウン用)
    private final Map<Location, Long> lastTriggerTime = new ConcurrentHashMap<>();

    public SneakGrowListener(Plugin plugin, CropGrowthSettings settings) {
        this.plugin = plugin;
        this.settings = settings;
    }

    public void updateSettings(CropGrowthSettings settings) {
        this.settings = settings;
        sneakCounts.clear();
        lastTriggerTime.clear();
    }

    public void clearAll() {
        sneakCounts.clear();
        lastTriggerTime.clear();
    }

    @EventHandler(ignoreCancelled = true)
    public void onToggleSneak(PlayerToggleSneakEvent event) {
        // しゃがみ「開始」の瞬間だけを対象にする(トグルOFFは無視)
        if (!event.isSneaking()) {
            return;
        }

        Player player = event.getPlayer();
        if (!player.hasPermission("cropsneakgrowth.use")) {
            return;
        }

        int r = (int) Math.ceil(settings.radius());
        Location center = player.getLocation();

        for (int dx = -r; dx <= r; dx++) {
            for (int dy = -1; dy <= 1; dy++) {
                for (int dz = -r; dz <= r; dz++) {
                    Block block = center.clone().add(dx, dy, dz).getBlock();
                    if (block.getLocation().distance(center) > settings.radius()) {
                        continue;
                    }
                    tryGrowCrop(player, block);
                }
            }
        }
    }

    private void tryGrowCrop(Player player, Block block) {
        if (!settings.isTargetCrop(block.getType())) {
            return;
        }

        BlockData data = block.getBlockData();
        if (!(data instanceof Ageable ageable)) {
            return;
        }
        if (ageable.getAge() >= ageable.getMaximumAge()) {
            // 既に成長しきっている
            return;
        }

        Location key = block.getLocation();
        long now = System.currentTimeMillis();
        Long last = lastTriggerTime.get(key);
        if (last != null && (now - last) < settings.cooldownMillis()) {
            return;
        }
        lastTriggerTime.put(key, now);

        int count = sneakCounts.merge(key, 1, Integer::sum);

        if (settings.effectsEnabled()) {
            block.getWorld().spawnParticle(
                    Particle.COMPOSTER,
                    block.getLocation().add(0.5, 0.5, 0.5),
                    2, 0.2, 0.2, 0.2, 0
            );
        }

        if (count >= settings.requiredSneaks()) {
            sneakCounts.remove(key);
            growCrop(block, ageable);
        }
    }

    private void growCrop(Block block, Ageable ageable) {
        int newAge = Math.min(ageable.getMaximumAge(), ageable.getAge() + settings.growthPerTrigger());
        ageable.setAge(newAge);
        block.setBlockData(ageable);

        if (settings.effectsEnabled()) {
            Location center = block.getLocation().add(0.5, 0.5, 0.5);
            block.getWorld().spawnParticle(Particle.COMPOSTER, center, 12, 0.3, 0.3, 0.3, 0.02);
            block.getWorld().playSound(center, Sound.BLOCK_COMPOSTER_FILL_SUCCESS, 0.7f, 1.2f);
        }
    }

    // 定期的に古いエントリを掃除して、メモリの肥大化を防ぐ(任意で呼び出し可能)
    public void startCleanupTask() {
        new BukkitRunnable() {
            @Override
            public void run() {
                long now = System.currentTimeMillis();
                lastTriggerTime.entrySet().removeIf(e -> (now - e.getValue()) > 10 * 60 * 1000);
                sneakCounts.keySet().removeIf(loc -> !lastTriggerTime.containsKey(loc));
            }
        }.runTaskTimer(plugin, 20L * 60, 20L * 60 * 5);
    }
}
