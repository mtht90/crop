package com.nakao.cropsneakgrowth;

import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.EnumSet;
import java.util.Set;

public final class CropSneakGrowthPlugin extends JavaPlugin {

    private CropGrowthSettings settings;
    private SneakGrowListener listener;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        loadSettings();

        listener = new SneakGrowListener(this, settings);
        getServer().getPluginManager().registerEvents(listener, this);
        listener.startCleanupTask();

        getLogger().info("CropSneakGrowth を有効化しました。");
    }

    @Override
    public void onDisable() {
        if (listener != null) {
            listener.clearAll();
        }
    }

    private void loadSettings() {
        reloadConfig();
        var cfg = getConfig();

        double radius = cfg.getDouble("radius", 2.5);
        int requiredSneaks = Math.max(1, cfg.getInt("required-sneaks", 5));
        int growthPerTrigger = Math.max(1, cfg.getInt("growth-per-trigger", 1));
        long cooldownMillis = Math.max(0, cfg.getLong("cooldown-millis", 250));
        boolean effectsEnabled = cfg.getBoolean("effects-enabled", true);

        Set<Material> crops = EnumSet.noneOf(Material.class);
        for (String name : cfg.getStringList("crops")) {
            Material mat = Material.matchMaterial(name);
            if (mat != null) {
                crops.add(mat);
            } else {
                getLogger().warning("不明なMaterial名をconfig.ymlのcropsで無視しました: " + name);
            }
        }
        if (crops.isEmpty()) {
            crops = EnumSet.of(
                    Material.WHEAT, Material.CARROTS, Material.POTATOES,
                    Material.BEETROOTS, Material.NETHER_WART,
                    Material.PUMPKIN_STEM, Material.MELON_STEM
            );
        }

        this.settings = new CropGrowthSettings(
                radius, requiredSneaks, growthPerTrigger, cooldownMillis, effectsEnabled, crops
        );
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 1 && args[0].equalsIgnoreCase("reload")) {
            if (!sender.hasPermission("cropsneakgrowth.admin")) {
                sender.sendMessage("§c権限がありません。");
                return true;
            }
            loadSettings();
            listener.updateSettings(settings);
            sender.sendMessage("§aCropSneakGrowth の設定をリロードしました。");
            return true;
        }
        sender.sendMessage("§e使い方: /cropsneakgrowth reload");
        return true;
    }
}
