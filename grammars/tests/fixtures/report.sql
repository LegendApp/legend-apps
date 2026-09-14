-- Active presentation authors
SELECT author_id, COUNT(*) AS presentations
FROM decks
WHERE published = true
GROUP BY author_id
ORDER BY presentations DESC;
