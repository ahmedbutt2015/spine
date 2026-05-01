<?php

namespace App\Controllers;

use App\Services\UserService;

class HomeController
{
    public function index(): void
    {
        (new UserService())->currentUser();
    }
}
