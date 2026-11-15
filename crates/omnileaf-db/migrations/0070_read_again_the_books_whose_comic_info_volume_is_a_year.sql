DELETE FROM book_person
    WHERE book_id IN (SELECT book_id FROM book_details WHERE volume BETWEEN 1000 AND 9999);
DELETE FROM book_tag
    WHERE book_id IN (SELECT book_id FROM book_details WHERE volume BETWEEN 1000 AND 9999);
DELETE FROM book_details WHERE volume BETWEEN 1000 AND 9999;
