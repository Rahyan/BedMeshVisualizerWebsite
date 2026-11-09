<?php
/** Optional maintainer command; generated assets are committed, so serving needs no build. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
if (!extension_loaded('gd') || !function_exists('imagettftext')) {
    fwrite(STDERR, "Asset generation needs PHP GD with FreeType.\n");
    exit(1);
}
$assets = dirname(__DIR__) . '/assets';
$source = imagecreatefrompng($assets . '/bedmesh-logo.png');
foreach (['bedmesh-brand.png' => 240, 'bedmesh-icon.png' => 64, 'bedmesh-touch.png' => 180] as $name => $size) {
    $output = imagecreatetruecolor($size, $size);
    imagealphablending($output, false);
    imagesavealpha($output, true);
    imagefill($output, 0, 0, imagecolorallocatealpha($output, 0, 0, 0, 127));
    imagecopyresampled($output, $source, 0, 0, 0, 0, $size, $size, imagesx($source), imagesy($source));
    imagepng($output, $assets . '/' . $name, 9);
    imagedestroy($output);
}

// A static share card, composed from the chosen logo and the site's own typeface.
$card = imagecreatetruecolor(1200, 630);
imagefill($card, 0, 0, imagecolorallocate($card, 255, 255, 255));
$ink = imagecolorallocate($card, 38, 48, 71);
$muted = imagecolorallocate($card, 82, 95, 116);
$blue = imagecolorallocate($card, 53, 76, 218);
$line = imagecolorallocate($card, 225, 229, 237);
imageline($card, 72, 118, 1128, 118, $line);
imageline($card, 72, 537, 1128, 537, $line);
imagecopyresampled($card, $source, 732, 129, 0, 0, 400, 400, imagesx($source), imagesy($source));
$font = $assets . '/fonts/PlusJakartaSans-Regular.ttf';
imagettftext($card, 26, 0, 72, 85, $ink, $font, 'Bed Mesh');
imagettftext($card, 45, 0, 72, 251, $blue, $font, 'Understand your');
imagettftext($card, 45, 0, 72, 317, $blue, $font, "printer's surface.");
imagettftext($card, 18, 0, 75, 384, $muted, $font, 'Visualize measurements. Compare your changes.');
imagettftext($card, 17, 0, 72, 586, $ink, $font, 'bedmesh.com');
imagettftext($card, 15, 0, 840, 586, $muted, $font, 'Free and open source');
imagepng($card, $assets . '/social-card.png', 9);
imagedestroy($source);
imagedestroy($card);
echo "Generated responsive brand, favicon, touch icon, and 1200×630 share card.\n";
