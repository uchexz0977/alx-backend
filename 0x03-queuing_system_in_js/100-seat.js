const express = require('express');
const redis = require('redis');
const { promisify } = require('util');
const kue = require('kue');

const client = redis.createClient();
const reserveSeat = promisify(client.set).bind(client);
const getCurrentAvailableSeats = promisify(client.get).bind(client);

const queue = kue.createQueue();

const app = express();
const port = 1245;
const initialSeats = 50;
let reservationEnabled = true;

reserveSeat('available_seats', initialSeats);
async function reserveSeat(number) {
    await client.set('available_seats', number);
}

async function getCurrentAvailableSeats() {
    const seats = await client.get('available_seats');
    return parseInt(seats);
}
queue.process('reserve_seat', async (job, done) => {
    const seats = await getCurrentAvailableSeats();

    if (seats <= 0) {
        reservationEnabled = false;
        done(new Error('Not enough seats available'));
    } else {
        await reserveSeat(seats - 1);
        done();
    }
});
app.get('/available_seats', async (req, res) => {
    const seats = await getCurrentAvailableSeats();
    res.json({ numberOfAvailableSeats: seats });
});

app.get('/reserve_seat', (req, res) => {
    if (!reservationEnabled) {
        return res.json({ status: 'Reservation are blocked' });
    }

    const job = queue.create('reserve_seat').save((err) => {
        if (!err) {
            res.json({ status: 'Reservation in process' });
        } else {
            res.json({ status: 'Reservation failed' });
        }
    });

    job.on('complete', () => {
        console.log(`Seat reservation job ${job.id} completed`);
    });

    job.on('failed', (err) => {
        console.log(`Seat reservation job ${job.id} failed: ${err.message}`);
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

