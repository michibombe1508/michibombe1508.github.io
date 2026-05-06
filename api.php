<?php
// ===== BOMBEN LEARN API =====
// Speichert alle Daten in einer simplen JSON-Datei auf dem Server
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Falls auf anderem Port getestet
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$dataFile = 'data.json';

// Wenn Datei nicht existiert, erstelle leere Struktur
if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode(['quizzes' => [], 'decks' => [], 'score' => 0, 'bestStreak' => 0]));
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Daten laden
    echo file_get_contents($dataFile);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Daten speichern
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if ($data) {
        file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT));
        echo json_encode(['success' => true]);
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
    }
    exit;
}
