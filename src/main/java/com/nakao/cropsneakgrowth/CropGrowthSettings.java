package com.nakao.cropsneakgrowth;

import org.bukkit.Material;

import java.util.Set;

/**
 * config.yml から読み込んだ設定値をまとめて保持する。
 */
public record CropGrowthSettings(
        double radius,
        int requiredSneaks,
        int growthPerTrigger,
        long cooldownMillis,
        boolean effectsEnabled,
        Set<Material> targetCrops
) {
    public boolean isTargetCrop(Material material) {
        return targetCrops.contains(material);
    }
}
